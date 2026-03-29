const jwt = require("jsonwebtoken");

const COOKIE_NAME = process.env.COOKIE_NAME || "tw_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// attach user info if cookie/JWT is valid; otherwise return 401
function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role, // we’ll include this in your auth token shortly
    };
    next();
  } catch (e) {
    console.error("Auth error:", e.message);
    return res.status(401).json({ ok: false, error: "Invalid or expired session" });
  }
}

// ensure user has a specific role (e.g. "agent" or "admin")
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
