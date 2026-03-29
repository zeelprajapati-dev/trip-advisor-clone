/**
 * server.js — TripAdvisor (Customer + Admin + Agent Integrated)
 * Stack: Node.js + Express + MongoDB + JWT Authentication
 *
 * Folder structure reference (important paths):
 *  - /public/js/dashboard.js            (front-end logic)
 *  - /views/index.html                  (customer dashboard)
 *  - /views/booking.html                (booking page)
 *  - /views/payment.html                (payment page)
 *  - /views/about.html                  (about page)
 *  - /views/ai-trips.html               (AI trips page)
 *  - /views/admin/admin-dashboard.html  (admin panel)
 *  - /views/admin/admin-login.html      (admin login)
 *  - /views/agent/agent-signup.html     (agent signup page)
 *  - /views/agent/agent-login.html      (agent login page)
 *  - /views/agent/add-trip.html         (agent add trip)
 *  - /views/agent/agent-dashboard.html  (agent dashboard)
 *  - /routes/tripRoutes.js              (trips API)
 *  - /routes/authRoutes.js              (auth API)
 *  - /routes/agentTripRoutes.js         (agent trip API)
 *  - /routes/bookingRoutes.js           (bookings API)
 *  - /routes/adminRoutes.js             (admin API)
 */

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/TripAdvisor";

const COOKIE_NAME = process.env.COOKIE_NAME || "tw_session";          // customer / agent
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || "tw_admin_session"; // admin cookie

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";

// ----------------------------------------------------
// Middleware
// ----------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ----------------------------------------------------
// MongoDB Connection
// ----------------------------------------------------
mongoose
  .connect(MONGO_URI, { dbName: "TripAdvisor" })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// ----------------------------------------------------
// Health Check (optional)
// ----------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// API ROUTES (Trips + Auth + Agent Trips + Bookings + Admin)
// ----------------------------------------------------
const tripsModule = require("./routes/tripRoutes");
const tripRoutes = tripsModule.default || tripsModule;
if (typeof tripRoutes !== "function")
  throw new TypeError("tripRoutes must export an Express Router");
app.use("/api/trips", tripRoutes);

const authModule = require("./routes/authRoutes");
const authRoutes = authModule.default || authModule;
if (typeof authRoutes !== "function")
  throw new TypeError("authRoutes must export an Express Router");
app.use("/api/auth", authRoutes);

const agentTripsModule = require("./routes/agentTripRoutes");
const agentTripRoutes = agentTripsModule.default || agentTripsModule;
if (typeof agentTripRoutes !== "function")
  throw new TypeError("agentTripRoutes must export an Express Router");
app.use("/api/agent/trips", agentTripRoutes);

const bookingsModule = require("./routes/bookingRoutes");
const bookingRoutes = bookingsModule.default || bookingsModule;
if (typeof bookingRoutes !== "function")
  throw new TypeError("bookingRoutes must export an Express Router");
app.use("/api/bookings", bookingRoutes);

const adminModule = require("./routes/adminRoutes");
const adminRoutes = adminModule.default || adminModule;
if (typeof adminRoutes !== "function")
  throw new TypeError("adminRoutes must export an Express Router");
app.use("/api/admin", adminRoutes);

// ----------------------------------------------------
// AI Chat (Perplexity) - Customer Chat for AI Trips
// ----------------------------------------------------
app.post("/api/ai/chat", async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false, error: "Message is required" });
  }
  if (!PERPLEXITY_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Perplexity API key is not configured on the server",
    });
  }

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3-sonar-small-32k-chat",
        messages: [
          {
            role: "system",
            content:
              "You are TripAdvisor AI – a friendly travel planning assistant. Ask clarifying questions, then suggest realistic trips and itineraries.",
          },
          ...(Array.isArray(history) ? history : []),
          { role: "user", content: message },
        ],
        temperature: 0.3,
        max_tokens: 512,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Perplexity API error:", data);
      return res.status(500).json({ ok: false, error: "AI request failed" });
    }
    const aiMessage =
      data?.choices?.[0]?.message?.content || "I could not generate a reply.";
    return res.json({ ok: true, reply: aiMessage });
  } catch (err) {
    console.error("AI route error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Internal server error (AI)" });
  }
});

// ----------------------------------------------------
// Auth Middleware for Agent Pages (JWT Protected)
// ----------------------------------------------------
function requireAgentPage(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.redirect("/agent/login");
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "agent") return res.redirect("/agent/login");
    req.user = decoded;
    next();
  } catch (e) {
    console.error("Page auth error:", e.message);
    return res.redirect("/agent/login");
  }
}

// ----------------------------------------------------
// Auth Middleware for Admin Pages (cookie-based)
// ----------------------------------------------------
function requireAdminPage(req, res, next) {
  try {
    const token = req.cookies[ADMIN_COOKIE_NAME];
    if (!token) return res.redirect("/admin/login");
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || decoded.role !== "admin") {
      return res.redirect("/admin/login");
    }
    req.admin = decoded;
    next();
  } catch (e) {
    console.error("Admin page auth error:", e.message);
    return res.redirect("/admin/login");
  }
}

// ----------------------------------------------------
// PAGE ROUTES
// ----------------------------------------------------

// --- Customer Pages ---
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});
app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});
app.get("/signup", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});
app.get("/booking", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "booking.html"));
});
app.get("/payment", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "payment.html"));
});
app.get("/profile", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "profile.html"));
});
app.get("/trip-details", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "trip-details.html"));
});

// --- AI Trips Page (Customer) ---
app.get("/ai-trips", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "ai-trips.html"));
});

// --- About Page (public) ---
app.get("/about", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "about.html"));
});

// -------------------------
// Admin Pages (ONLY admin)
// -------------------------

// Smart entry: /admin → if authed go to dashboard, else login
app.get("/admin", (req, res) => {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token) return res.redirect("/admin/login");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.role === "admin") {
      return res.redirect("/admin/admin-dashboard");
    }
  } catch (_) {}
  return res.redirect("/admin/login");
});

// Login page (public)
app.get("/admin/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin", "admin-login.html"));
});

// Protected admin pages
// --- Admin root: smart redirect to login or dashboard ---
app.get("/admin", (req, res) => {
  try {
    const token = req.cookies[ADMIN_COOKIE_NAME] || "";
    const decoded = token ? jwt.verify(token, JWT_SECRET) : null;
    if (decoded && decoded.role === "admin") {
      return res.redirect("/admin/admin-dashboard");
    }
  } catch (_) {
    // ignore and fall through to login
  }
  return res.redirect("/admin/login");
});

// Small helper to serve admin views
function serveAdmin(viewFile) {
  return (_req, res) =>
    res.sendFile(path.join(__dirname, "views", "admin", viewFile));
}

// ---- Admin protected pages (requireAdminPage) ----
app.get("/admin/admin-dashboard", requireAdminPage, serveAdmin("admin-dashboard.html"));
app.get("/admin/admin-agents",    requireAdminPage, serveAdmin("admin-agents.html"));
app.get("/admin/admin-approvals", requireAdminPage, serveAdmin("admin-approvals.html"));
app.get("/admin/admin-customers", requireAdminPage, serveAdmin("admin-customers.html"));
app.get("/admin/admin-trips",     requireAdminPage, serveAdmin("admin-trips.html"));
app.get("/admin/admin-bookings",  requireAdminPage, serveAdmin("admin-bookings.html"));
app.get("/admin/admin-payments",  requireAdminPage, serveAdmin("admin-payments.html"));
app.get("/admin/admin-alerts",    requireAdminPage, serveAdmin("admin-alerts.html"));


// --- Agent Pages ---
app.get("/agent/signup", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-signup.html"));
});
app.get("/agent/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-login.html"));
});
app.get("/agent/dashboard", requireAgentPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-dashboard.html"));
});
app.get("/agent/profile", (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-profile.html"));
});
app.get("/agent/trips/new", requireAgentPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "add-trip.html"));
});
app.get("/agent/bookings", requireAgentPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-bookings.html"));
});
app.get("/agent/trips", requireAgentPage, (_req, res) => {
  res.sendFile(path.join(__dirname, "views", "agent", "agent-trips.html"));
});

// ----------------------------------------------------
// 404 + Fallback
// ----------------------------------------------------
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, error: "API endpoint not found" });
  }
  return res.sendFile(path.join(__dirname, "views", "index.html"));
});

// ----------------------------------------------------
// Global Error Handler
// ----------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error("🚨 Server error:", err);
  return res.status(500).json({ ok: false, error: "Internal server error" });
});

// ----------------------------------------------------
// Start Server
// ----------------------------------------------------
app.listen(PORT, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log("🚀 TripAdvisor Server Active");
  console.log("----------------------------------------");
  console.log(`👥 Customer Portal: ${base}/`);
  console.log(`🧍‍♂️ Agent Portal:   ${base}/agent/dashboard`);
  console.log(`🧑‍💼 Admin Login:    ${base}/admin/login`);
  console.log(`🧑‍💼 Admin Panel:    ${base}/admin/admin-dashboard`);
  console.log("----------------------------------------");
});
