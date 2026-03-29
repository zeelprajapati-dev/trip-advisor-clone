// routes/adminRoutes.js
// -------------------------------------------------------
// Admin auth + analytics API for TripWise
// -------------------------------------------------------

const express = require("express");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Trip = require("../models/Trip");
const Booking = require("../models/Booking");

const router = express.Router();

// -----------------------------------------------------
// Config / constants
// -----------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@tripwise.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME || "TripWise Admin";

const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME || "tw_admin_session";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// -----------------------------------------------------
// Helper: issue admin JWT cookie
// -----------------------------------------------------
function setAdminCookie(res) {
  const token = jwt.sign(
    {
      role: "admin",
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });

  return token;
}

// -----------------------------------------------------
// Middleware: require admin auth
// -----------------------------------------------------
function requireAdmin(req, res, next) {
  try {
    const token = req.cookies[ADMIN_COOKIE_NAME];
    if (!token) {
      return res
        .status(401)
        .json({ ok: false, error: "Not authenticated" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== "admin") {
      return res
        .status(401)
        .json({ ok: false, error: "Not authenticated" });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    console.error("Admin auth error:", err.message);
    return res
      .status(401)
      .json({ ok: false, error: "Not authenticated" });
  }
}

// -----------------------------------------------------
// POST /api/admin/login
// Body: { email, password }
// -----------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required" });
    }

    // fixed creds check
    if (
      email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase() ||
      password !== ADMIN_PASSWORD
    ) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid admin credentials" });
    }

    setAdminCookie(res);

    // ⬇️ Minimal change: tell the client exactly where to go after login
    return res.json({
      ok: true,
      redirectTo: "/admin/admin-dashboard",
      admin: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Internal server error" });
  }
});

// -----------------------------------------------------
// POST /api/admin/logout
// -----------------------------------------------------
router.post("/logout", (req, res) => {
  try {
    res.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch (e) {
    // ignore – cookie may not exist
  }
  return res.json({ ok: true });
});

// -----------------------------------------------------
// GET /api/admin/me
// → check current admin session
// -----------------------------------------------------
router.get("/me", requireAdmin, (req, res) => {
  return res.json({
    ok: true,
    admin: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
    },
  });
});

// -----------------------------------------------------
// GET /api/admin/summary
// → stats for dashboard cards (bookings, revenue, trips, users, alerts)
// -----------------------------------------------------
router.get("/summary", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const sevenDaysAgo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7
    );

    // Load raw data
    const [allBookings, allTrips, allUsers] = await Promise.all([
      Booking.find({}).lean(),
      Trip.find({}).lean(),
      User.find({}).lean(),
    ]);

    // --- bookings counts ---
    const bookingsToday = allBookings.filter((b) => {
      const created = b.createdAt ? new Date(b.createdAt) : null;
      return created && created >= startOfToday;
    });

    const bookingsThisWeek = allBookings.filter((b) => {
      const created = b.createdAt ? new Date(b.createdAt) : null;
      return created && created >= sevenDaysAgo;
    });

    const totalBookings = allBookings.length;

    // status breakdown
    const confirmedBookings = allBookings.filter(
      (b) => (b.status || "").toLowerCase() === "confirmed"
    ).length;
    const pendingBookings = allBookings.filter(
      (b) =>
        (b.status || "").toLowerCase() === "pending" ||
        (b.status || "").toLowerCase() === "unconfirmed"
    ).length;
    const cancelledBookings = allBookings.filter(
      (b) => (b.status || "").toLowerCase() === "cancelled"
    ).length;

    // --- revenue ---
    const totalRevenue = allBookings.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );

    const revenueToday = bookingsToday.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );
    const revenueThisWeek = bookingsThisWeek.reduce(
      (sum, b) => sum + (b.totalAmount || 0),
      0
    );

    // --- trips ---
    const activeTrips = allTrips.filter((t) => !t.hidden).length;
    const hiddenTrips = allTrips.filter((t) => t.hidden).length;

    // low availability (if your schema has availableSeats or seatsLeft)
    const lowAvailabilityTrips = allTrips.filter((t) => {
      const seats =
        typeof t.availableSeats === "number"
          ? t.availableSeats
          : typeof t.seatsLeft === "number"
          ? t.seatsLeft
          : null;
      return seats !== null && seats > 0 && seats <= 3;
    }).length;

    // --- users ---
    const agents = allUsers.filter((u) => u.role === "agent").length;
    const customers = allUsers.filter((u) => u.role === "customer").length;

    // New agents in last 7 days (for "new agents signed up")
    const newAgents = allUsers.filter((u) => {
      if (u.role !== "agent") return false;
      if (!u.createdAt) return false;
      const created = new Date(u.createdAt);
      return created >= sevenDaysAgo;
    }).length;

    // pending approval agents if you store isApproved/status
    const pendingApprovalAgents = allUsers.filter((u) => {
      if (u.role !== "agent") return false;
      if (typeof u.isApproved === "boolean") {
        return !u.isApproved;
      }
      if (u.status && typeof u.status === "string") {
        return u.status.toLowerCase() === "pending";
      }
      return false;
    }).length;

    // --- alerts ---
    const paymentFailed = allBookings.filter(
      (b) => (b.paymentStatus || "").toLowerCase() === "failed"
    ).length;

    const cancellations = cancelledBookings;

    const refundRequests = allBookings.filter((b) => {
      const rs = (b.refundStatus || "").toLowerCase();
      return rs === "requested" || rs === "pending";
    }).length;

    // Simple (mock) profit margin if you want it:
    const profitMargin =
      totalRevenue > 0 ? ((totalRevenue * 0.25) / totalRevenue) * 100 : 0;

    return res.json({
      ok: true,
      cards: {
        bookings: {
          today: bookingsToday.length,
          thisWeek: bookingsThisWeek.length,
          total: totalBookings,
          confirmed: confirmedBookings,
          pending: pendingBookings,
          cancelled: cancelledBookings,
        },
        revenue: {
          totalRevenue,
          revenueToday,
          revenueThisWeek,
          currency: "INR",
        },
        trips: {
          active: activeTrips,
          hidden: hiddenTrips,
          total: allTrips.length,
          lowAvailability: lowAvailabilityTrips,
        },
        users: {
          agents,
          customers,
          total: allUsers.length,
          newAgentsLast7Days: newAgents,
          pendingApprovalAgents,
        },
        alerts: {
          paymentFailed,
          cancellations,
          refundRequests,
        },
        profitMargin: Number(profitMargin.toFixed(1)),
      },
    });
  } catch (err) {
    console.error("Admin summary error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch summary" });
  }
});

// -----------------------------------------------------
// GET /api/admin/activity
// → recent bookings + quick alerts list
// -----------------------------------------------------
router.get("/activity", requireAdmin, async (_req, res) => {
  try {
    const recentBookings = await Booking.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("tripId", "title src dst")
      .populate("userId", "name email")
      .lean();

    const formatted = recentBookings.map((b) => ({
      id: String(b._id),
      customerName: b.userId?.name || "Unknown",
      customerEmail: b.userId?.email || "-",
      tripTitle: b.tripId?.title || "-",
      route:
        b.tripId && (b.tripId.src || b.tripId.dst)
          ? `${b.tripId.src || ""} → ${b.tripId.dst || ""}`
          : null,
      passengers: b.passengers || b.persons || 0,
      totalAmount: b.totalAmount || 0,
      paymentStatus: b.paymentStatus || "pending",
      status: b.status || "unconfirmed",
      createdAt: b.createdAt,
      startDate: b.departureDate || b.startDate || null,
    }));

    return res.json({
      ok: true,
      recentBookings: formatted,
    });
  } catch (err) {
    console.error("Admin activity error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch activity" });
  }
});

// -----------------------------------------------------
// AGENTS — list + approval workflow
// -----------------------------------------------------

// GET /api/admin/agents
// Optional query: status=pending|active|suspended, q=<search>, limit, offset
router.get("/agents", requireAdmin, async (req, res) => {
  try {
    const { status, q, limit = 50, offset = 0 } = req.query;

    const find = { role: "agent" };
    if (status) {
      find.$or = [
        { status: status.toLowerCase() },
        // support old boolean field
        ...(status.toLowerCase() === "pending"
          ? [{ isApproved: false }]
          : status.toLowerCase() === "active"
          ? [{ isApproved: true }]
          : []),
      ];
    }
    if (q) {
      find.$or = [
        ...(find.$or || []),
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { company: new RegExp(q, "i") },
        { agencyName: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
      ];
    }

    const docs = await User.find(find)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    // Optionally enrich with counters (kept light)
    const agentIds = docs.map((d) => d._id);
    const [tripsCounts, bookingCounts] = await Promise.all([
      Trip.aggregate([
        { $match: { provider: { $in: agentIds } } },
        { $group: { _id: "$provider", n: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { agentId: { $in: agentIds } } },
        { $group: { _id: "$agentId", n: { $sum: 1 } } },
      ]),
    ]);
    const tripMap = Object.fromEntries(tripsCounts.map((x) => [String(x._id), x.n]));
    const bookingMap = Object.fromEntries(bookingCounts.map((x) => [String(x._id), x.n]));

    const agents = docs.map((d) => ({
      _id: d._id,
      name: d.name || "Unnamed",
      email: d.email,
      phone: d.phone || d.contactNumber,
      company: d.company || d.agencyName,
      status: (d.status || (d.isApproved ? "active" : "pending")).toLowerCase(),
      kycStatus: d.kycStatus || "not-submitted",
      tripsCount: tripMap[String(d._id)] || 0,
      bookingsCount: bookingMap[String(d._id)] || 0,
      createdAt: d.createdAt,
    }));

    res.json({ ok: true, agents });
  } catch (err) {
    console.error("Admin agents list error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch agents" });
  }
});

// PATCH /api/admin/agents/:id/status
// Body: { status: "pending"|"active"|"suspended" }
router.patch("/agents/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body || {};
    status = String(status || "").toLowerCase();

    if (!["pending", "active", "suspended"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Invalid status" });
    }

    const patch = { status };
    // keep legacy boolean in sync if present
    if (status === "active") patch.isApproved = true;
    if (status === "pending" || status === "suspended") patch.isApproved = false;

    const updated = await User.findOneAndUpdate(
      { _id: id, role: "agent" },
      patch,
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "Agent not found" });
    }

    return res.json({
      ok: true,
      agent: {
        _id: updated._id,
        name: updated.name,
        email: updated.email,
        status: updated.status || (updated.isApproved ? "active" : "pending"),
      },
    });
  } catch (err) {
    console.error("Admin update agent status error:", err);
    res.status(500).json({ ok: false, error: "Failed to update agent" });
  }
});

// -----------------------------------------------------
// OPTIONAL: simple list endpoints for other admin pages
// -----------------------------------------------------

// GET /api/admin/customers
// Optional: q, limit, offset
router.get("/customers", requireAdmin, async (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    const find = { role: "customer" };
    if (q) {
      find.$or = [
        { name: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
      ];
    }
    const customers = await User.find(find)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    res.json({ ok: true, customers });
  } catch (err) {
    console.error("Admin customers error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch customers" });
  }
});

// GET /api/admin/trips
// Optional: hidden=true|false, q, limit, offset
router.get("/trips", requireAdmin, async (req, res) => {
  try {
    const { hidden, q, limit = 50, offset = 0 } = req.query;
    const find = {};
    if (hidden === "true") find.hidden = true;
    if (hidden === "false") find.hidden = { $ne: true };
    if (q) {
      find.$or = [
        { title: new RegExp(q, "i") },
        { src: new RegExp(q, "i") },
        { dst: new RegExp(q, "i") },
      ];
    }

    const trips = await Trip.find(find)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Math.min(Number(limit) || 50, 200))
      .lean();

    res.json({ ok: true, trips });
  } catch (err) {
    console.error("Admin trips error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch trips" });
  }
});

// GET /api/admin/bookings
// Optional: status, paymentStatus, q (customer email/name), limit, offset
router.get("/bookings", requireAdmin, async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      q,
      limit = 50,
      offset = 0,
    } = req.query;

    const find = {};
    if (status) find.status = new RegExp("^" + status + "$", "i");
    if (paymentStatus) find.paymentStatus = new RegExp("^" + paymentStatus + "$", "i");

    let query = Booking.find(find)
      .sort({ createdAt: -1 })
      .skip(Number(offset) || 0)
      .limit(Math.min(Number(limit) || 50, 200))
      .populate("tripId", "title src dst")
      .populate("userId", "name email");

    const docs = await query.lean();

    // basic client-side filter for q across name/email
    const list = (q
      ? docs.filter((b) => {
          const name = b.userId?.name || "";
          const email = b.userId?.email || "";
          return name.toLowerCase().includes(q.toLowerCase()) ||
                 email.toLowerCase().includes(q.toLowerCase());
        })
      : docs
    ).map((b) => ({
      _id: b._id,
      customerName: b.userId?.name || "Unknown",
      customerEmail: b.userId?.email || "-",
      tripTitle: b.tripId?.title || "-",
      route:
        b.tripId && (b.tripId.src || b.tripId.dst)
          ? `${b.tripId.src || ""} → ${b.tripId.dst || ""}`
          : null,
      passengers: b.passengers || b.persons || 0,
      totalAmount: b.totalAmount || 0,
      paymentStatus: b.paymentStatus || "pending",
      status: b.status || "unconfirmed",
      createdAt: b.createdAt,
      startDate: b.departureDate || b.startDate || null,
    }));

    res.json({ ok: true, bookings: list });
  } catch (err) {
    console.error("Admin bookings error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch bookings" });
  }
});

// -----------------------------------------------------
// Export router + helper so server.js can reuse guard
// -----------------------------------------------------
router.requireAdmin = requireAdmin;

module.exports = router;
