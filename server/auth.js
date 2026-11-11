import { Router } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

const SESSION_DAYS = 14;
const router = Router();

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, studentId: u.student_id, program: u.program };
}

function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  return token;
}

export function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString());
  if (!row) return res.status(401).json({ error: "Session expired, please sign in again" });
  req.user = row;
  req.token = token;
  next();
}

export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ error: `This area is for ${role}s only` });

router.post("/register", (req, res) => {
  const { name, email, password, studentId } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: "Name, email and password are required" });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.trim())) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role, student_id) VALUES (?, ?, ?, ?, ?)")
    .run(name.trim(), email.trim(), hashPassword(password), "student", studentId?.trim() || null);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ token: createSession(user.id), user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const user = email && db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim());
  if (!user || !verifyPassword(String(password ?? ""), user.password_hash)) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }
  res.json({ token: createSession(user.id), user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post("/logout", requireAuth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.sendStatus(204);
});

router.patch("/program", requireAuth, requireRole("student"), (req, res) => {
  const { program } = req.body ?? {};
  if (program !== "software_engineering") return res.status(400).json({ error: "Unknown program" });
  db.prepare("UPDATE users SET program = ? WHERE id = ?").run(program, req.user.id);
  res.json({ program });
});

export default router;
