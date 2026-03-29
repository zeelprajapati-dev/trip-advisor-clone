const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const COOKIE_NAME = process.env.COOKIE_NAME || "tw_session";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

exports.signup = async (req, res) => {
  try {
    const { name, email, password, confirm } = req.body;
    if (!name || !email || !password || !confirm)
      return res.status(400).json({ ok: false, error: "All fields required" });

    if (password !== confirm)
      return res.status(400).json({ ok: false, error: "Passwords do not match" });

    if (password.length < 6)
      return res.status(400).json({ ok: false, error: "Password too short" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ ok: false, error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash
    });

    setAuthCookie(res, user);
    return res.status(201).json({ ok: true, redirect: "/" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ ok: false, error: "Signup failed" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    setAuthCookie(res, user);
    res.json({ ok: true, redirect: "/" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Login failed" });
  }
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
};
