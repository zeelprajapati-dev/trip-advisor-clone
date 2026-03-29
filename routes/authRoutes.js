// routes/authRoutes.js
// ------------------------------------------------------------------
// Auth API for TripAdvisor (signup, login, logout, session check)
// Uses HTTP-only JWT cookie for session management
// Supports user roles: customer, agent, admin
// ------------------------------------------------------------------

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const User = require("../models/User");

// IMPORTANT: import the actual middleware function
const { requireAuth } = require("../middleware/authGuard");

const router = express.Router();

// ---- Config (env with safe fallbacks)
const COOKIE_NAME = process.env.COOKIE_NAME || "tw_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";
const COOKIE_SECURE = process.env.NODE_ENV === "production"; // set true in prod (HTTPS)

// ---- Helpers

// NOTE: now includes user.role
function issueToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role, // <- important for agent/admin features
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000, // keep in sync with JWT_EXPIRES
    path: "/",
  });
}

function normalizeEmail(email) {
  return (email || "").toLowerCase().trim();
}

// ------------------------------------------------------------------
// POST /api/auth/signup
// Body: { name, email, password, confirm, [role] }
//
// NOTE:
// - By default, users are "customer".
// - If you later build an "agent signup" flow, you can send role:"agent".
// ------------------------------------------------------------------
router.post("/signup", async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";
    const confirm = req.body.confirm || "";
    const requestedRole = (req.body.role || "").trim().toLowerCase();

    // Basic validations
    if (!name || !email || !password || !confirm) {
      return res
        .status(400)
        .json({ ok: false, error: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res
        .status(400)
        .json({ ok: false, error: "Enter a valid email address" });
    }
    if (password !== confirm) {
      return res
        .status(400)
        .json({ ok: false, error: "Passwords do not match" });
    }
    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "Password must be at least 6 characters",
      });
    }

    // Uniqueness check
    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, error: "Email already registered" });
    }

    // Decide role (default: customer)
    // For now: only allow "agent" explicitly, otherwise "customer".
    // You can later restrict agent creation (e.g. require admin or secret code).
    let role = "customer";
    if (requestedRole === "agent") {
      role = "agent";
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role });

    // Session
    const token = issueToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      ok: true,
      redirect: "/",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ ok: false, error: "Signup failed" });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/login
// Body: { email, password }
// Returns: { ok, redirect, user? }
// ------------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // generic message to avoid user enumeration
      return res
        .status(401)
        .json({ ok: false, error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid credentials" });
    }

    const token = issueToken(user);
    setAuthCookie(res, token);

    return res.json({
      ok: true,
      redirect: "/",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// ------------------------------------------------------------------
// GET /api/auth/me
// Returns current user from session cookie
//
// Uses requireAuth middleware from middleware/authGuard.js
// ------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  return res.json({
    ok: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// ------------------------------------------------------------------
// GET /api/auth/check-email?email=foo@bar.com
// Quick availability check for signup forms
// ------------------------------------------------------------------
router.get("/check-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email || !validator.isEmail(email)) {
      return res
        .status(400)
        .json({ ok: false, error: "Provide a valid email" });
    }
    const exists = await User.findOne({ email });
    return res.json({ ok: true, available: !exists });
  } catch (err) {
    console.error("check-email error:", err);
    return res.status(500).json({ ok: false, error: "Failed to check email" });
  }
});

// ------------------------------------------------------------------
// POST /api/auth/logout
// Clears the session cookie
// ------------------------------------------------------------------
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

module.exports = router;
