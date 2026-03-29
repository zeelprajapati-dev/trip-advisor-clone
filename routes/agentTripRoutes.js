/**
 * routes/agentTripRoutes.js
 * -----------------------------------------------------
 * TripAdvisor Agent API Routes
 * Handles trip creation, analytics summary, customer lists,
 * and trip management actions (hide/unhide, duplicate, delete).
 * -----------------------------------------------------
 */

const express = require("express");
const Trip = require("../models/Trip");
const Booking = require("../models/Booking"); // required for revenue & customer tracking
const { requireAuth, requireRole } = require("../middleware/authGuard");

const router = express.Router();

/* ----------------------------------------------------
 * Helper: Parse multiline inputs into structured arrays
 * ---------------------------------------------------- */
function parseList(raw, withNights = false) {
  if (!raw || typeof raw !== "string") return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let nights;
      let nameAndDesc = line;

      if (withNights && line.includes("@")) {
        const [left, right] = line.split("@");
        nameAndDesc = left.trim();
        nights = Number(right.trim()) || undefined;
      }

      const [name, description] = nameAndDesc.split(" - ");
      return {
        name: (name || "").trim(),
        description: (description || "").trim(),
        nights,
      };
    })
    .filter((item) => item.name.length > 0);
}

/* ----------------------------------------------------
 * POST /api/agent/trips
 * → Create a new trip by the logged-in agent
 * ---------------------------------------------------- */
router.post("/", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const {
      title,
      src,
      dst,
      durationDays,
      pricePerPersonPerDay,
      img,
      hotelsText,
      restaurantsText,
      sightseeingText,
      // (extra fields like itineraryText / galleryImages are ignored safely if present)
    } = req.body;

    if (!title || !src || !dst || !pricePerPersonPerDay) {
      return res.status(400).json({
        ok: false,
        error: "title, src, dst and pricePerPersonPerDay are required",
      });
    }

    const trip = await Trip.create({
      title: title.trim(),
      src: src.trim(),
      dst: dst.trim(),
      durationDays: Number(durationDays) || 3,
      pricePerPersonPerDay: Number(pricePerPersonPerDay),
      img: img || "",
      rating: 4.5,
      provider: req.user.id,
      hotels: parseList(hotelsText, true),
      restaurants: parseList(restaurantsText, false),
      sightseeing: parseList(sightseeingText, false),
      // any new fields you added in the Trip model can also be set here
    });

    return res.status(201).json({ ok: true, trip });
  } catch (e) {
    console.error("❌ Error creating agent trip:", e);
    return res.status(500).json({ ok: false, error: "Could not create trip" });
  }
});

/* ----------------------------------------------------
 * GET /api/agent/trips/my
 * → List all trips created by this agent
 * ---------------------------------------------------- */
router.get("/my", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const trips = await Trip.find({ provider: req.user.id }).sort({
      createdAt: -1,
    });
    return res.json({ ok: true, trips });
  } catch (e) {
    console.error("❌ Error fetching agent trips:", e);
    return res.status(500).json({ ok: false, error: "Could not fetch trips" });
  }
});

/* ----------------------------------------------------
 * PATCH /api/agent/trips/:id/visibility
 * → Hide / unhide a trip (soft visibility toggle)
 * ---------------------------------------------------- */
router.patch(
  "/:id/visibility",
  requireAuth,
  requireRole("agent"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { hidden } = req.body;

      if (typeof hidden !== "boolean") {
        return res
          .status(400)
          .json({ ok: false, error: "hidden must be a boolean" });
      }

      const trip = await Trip.findOneAndUpdate(
        { _id: id, provider: req.user.id },
        { hidden },
        { new: true }
      );

      if (!trip) {
        return res.status(404).json({
          ok: false,
          error: "Trip not found or not owned by this agent",
        });
      }

      return res.json({ ok: true, trip });
    } catch (e) {
      console.error("❌ Error updating trip visibility:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Could not update trip visibility" });
    }
  }
);

/* ----------------------------------------------------
 * POST /api/agent/trips/:id/duplicate
 * → Duplicate an existing trip owned by this agent
 * ---------------------------------------------------- */
router.post(
  "/:id/duplicate",
  requireAuth,
  requireRole("agent"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const original = await Trip.findOne({
        _id: id,
        provider: req.user.id,
      });

      if (!original) {
        return res.status(404).json({
          ok: false,
          error: "Trip not found or not owned by this agent",
        });
      }

      const copyTitle =
        original.title && !original.title.toLowerCase().includes("(copy)")
          ? `${original.title} (copy)`
          : original.title || "Untitled trip (copy)";

      const newTrip = await Trip.create({
        title: copyTitle,
        src: original.src,
        dst: original.dst,
        durationDays: original.durationDays,
        pricePerPersonPerDay: original.pricePerPersonPerDay,
        img: original.img,
        rating: original.rating,
        provider: req.user.id,
        hotels: original.hotels,
        restaurants: original.restaurants,
        sightseeing: original.sightseeing,
        hidden: false,
      });

      return res.status(201).json({ ok: true, trip: newTrip });
    } catch (e) {
      console.error("❌ Error duplicating trip:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Could not duplicate trip" });
    }
  }
);

/* ----------------------------------------------------
 * DELETE /api/agent/trips/:id
 * → Permanently delete a trip owned by this agent
 * ---------------------------------------------------- */
router.delete(
  "/:id",
  requireAuth,
  requireRole("agent"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const trip = await Trip.findOneAndDelete({
        _id: id,
        provider: req.user.id,
      });

      if (!trip) {
        return res.status(404).json({
          ok: false,
          error: "Trip not found or not owned by this agent",
        });
      }

      // (Optional) you could also handle related bookings here if needed

      return res.json({ ok: true });
    } catch (e) {
      console.error("❌ Error deleting trip:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Could not delete trip" });
    }
  }
);

/* ----------------------------------------------------
 * GET /api/agent/trips/summary
 * → Provides analytics summary for dashboard metrics
 * ---------------------------------------------------- */
router.get("/summary", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const agentId = req.user.id;

    // Fetch trips & bookings for this agent in parallel
    const [trips, bookingsRaw] = await Promise.all([
      Trip.find({ provider: agentId }),
      Booking.find({ agentId }).select("status totalAmount"),
    ]);

    const bookings = Array.isArray(bookingsRaw) ? bookingsRaw : [];

    const totalTrips = Array.isArray(trips) ? trips.length : 0;
    const totalBookings = bookings.length;
    const activeBookings = bookings.filter(
      (b) => b.status === "confirmed"
    ).length;
    const totalRevenue = bookings.reduce(
      (sum, b) => sum + (Number(b.totalAmount) || 0),
      0
    );

    const profitMargin =
      totalRevenue > 0
        ? ((totalRevenue * 0.25) / totalRevenue) * 100
        : 0; // mock 25% profit margin

    // Generate simple mock trend data (for charts)
    const chartLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const chartRevenue = chartLabels.map(() =>
      Math.floor(Math.random() * 20000 + 5000)
    );
    const chartTrips = chartLabels.map(() =>
      Math.floor(Math.random() * 10 + 2)
    );

    return res.json({
      ok: true,
      totalTrips,
      totalBookings,
      activeBookings,
      totalRevenue,
      profitMargin: profitMargin.toFixed(1),
      chartLabels,
      chartRevenue,
      chartTrips,
    });
  } catch (e) {
    console.error("❌ Error fetching summary:", e);
    return res
      .status(500)
      .json({ ok: false, error: "Could not fetch summary" });
  }
});

/* ----------------------------------------------------
 * GET /api/agent/trips/customers
 * → Lists all customers who booked this agent’s trips
 * ---------------------------------------------------- */
router.get(
  "/customers",
  requireAuth,
  requireRole("agent"),
  async (req, res) => {
    try {
      const agentId = req.user.id;

      const customers = await Booking.find({ agentId })
        .populate("tripId", "title src dst durationDays pricePerPersonPerDay")
        .populate("userId", "name email")
        .sort({ createdAt: -1 });

      const formatted = customers.map((b) => ({
        customerName: b.userId?.name || "Unknown",
        email: b.userId?.email || "-",
        phone: b.phone || b.contactNumber || undefined,
        tripTitle: b.tripId?.title || "-",
        route: `${b.tripId?.src || ""} → ${b.tripId?.dst || ""}`,
        departureDate: b.startDate || b.departureDate || null,
        passengers: b.passengers || 0,
        paymentStatus: b.paymentStatus || "pending",
        status: b.status || "unconfirmed",
        totalAmount: Number(b.totalAmount) || 0,
      }));

      return res.json({ ok: true, customers: formatted });
    } catch (e) {
      console.error("❌ Error fetching customers:", e);
      return res
        .status(500)
        .json({ ok: false, error: "Could not fetch customers" });
    }
  }
);

module.exports = router;
