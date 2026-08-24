// lib/auth.js
//
// Signup/login/logout logic plus a small requireAuth / attachUser
// middleware pair used by server.js.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { users } = require("./db");

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt };
}

function validateSignupInput({ username, email, password }) {
  if (!username || !USERNAME_RE.test(username)) {
    return "Username must be 3-32 characters (letters, numbers, underscore, dot, dash only).";
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return "Please enter a valid email address.";
  }
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

async function signup({ username, email, password }) {
  const error = validateSignupInput({ username, email, password });
  if (error) {
    const e = new Error(error);
    e.status = 400;
    throw e;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  const existing = users.find(
    (u) => u.username.toLowerCase() === normalizedUsername.toLowerCase() || u.email === normalizedEmail
  );
  if (existing) {
    const e = new Error("An account with that username or email already exists.");
    e.status = 409;
    throw e;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  await users.insert(user);
  return publicUser(user);
}

async function login({ identifier, password }) {
  if (!identifier || !password) {
    const e = new Error("Username/email and password are required.");
    e.status = 400;
    throw e;
  }
  const normalized = identifier.trim().toLowerCase();
  const user = users.find(
    (u) => u.username.toLowerCase() === normalized || u.email === normalized
  );
  if (!user) {
    const e = new Error("Invalid credentials.");
    e.status = 401;
    throw e;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const e = new Error("Invalid credentials.");
    e.status = 401;
    throw e;
  }
  return publicUser(user);
}

// Attaches req.user (or null) based on the session, without blocking the request.
function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = users.find((u) => u.id === req.session.userId);
    req.user = publicUser(user);
  } else {
    req.user = null;
  }
  next();
}

// Blocks the request unless a user is logged in.
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  next();
}

module.exports = { signup, login, publicUser, attachUser, requireAuth };
