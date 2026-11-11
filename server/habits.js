// Habit tracker API (see github.com/birukG09/ArcHabit): up to 10 habits, 90 days each,
// click a day to toggle. Scoped per signed-in student.
import { Router } from "express";
import { db } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";

const router = Router();
router.use(requireAuth, requireRole("student"));

export const TOTAL_DAYS = 90;
const MAX_HABITS = 10;
// Green-led palette so the rings fit the green & white theme but stay distinguishable.
const HABIT_COLORS = [
  "#198754", "#0f766e", "#65a30d", "#0891b2", "#d97706",
  "#7c3aed", "#db2777", "#2563eb", "#b45309", "#4d7c0f",
];

function dayNumber(startDate, today = new Date()) {
  if (!startDate) return null;
  const s = new Date(`${startDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const n = Math.floor((t - s) / 86400000) + 1;
  return n >= 1 && n <= TOTAL_DAYS ? n : n > TOTAL_DAYS ? TOTAL_DAYS : null;
}

function streaks(completedDays, todayDay) {
  // best = longest consecutive run; current = run ending today (or yesterday if today not yet done)
  let best = 0, run = 0;
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    if (completedDays.has(d)) { run++; best = Math.max(best, run); } else run = 0;
  }
  let current = 0;
  if (todayDay) {
    let d = completedDays.has(todayDay) ? todayDay : todayDay - 1;
    while (d >= 1 && completedDays.has(d)) { current++; d--; }
  }
  return { current, best };
}

export function loadHabits(userId) {
  const start = db.prepare("SELECT habit_start_date AS s FROM user_settings WHERE user_id = ?").get(userId)?.s ?? null;
  const todayDay = dayNumber(start);
  const habits = db.prepare("SELECT * FROM habits WHERE user_id = ? ORDER BY created_at, id").all(userId);
  const entries = db
    .prepare(
      `SELECT e.* FROM habit_entries e JOIN habits h ON h.id = e.habit_id WHERE h.user_id = ?`
    )
    .all(userId);
  const list = habits.map((h) => {
    const mine = entries.filter((e) => e.habit_id === h.id);
    const done = new Set(mine.filter((e) => e.completed).map((e) => e.day));
    const { current, best } = streaks(done, todayDay);
    const elapsed = todayDay ?? 0;
    const doneSoFar = [...done].filter((d) => !elapsed || d <= elapsed).length;
    return {
      id: h.id, name: h.name, color: h.color,
      completedDays: [...done].sort((a, b) => a - b),
      totalCompleted: done.size,
      completionPercent: Math.round((done.size / TOTAL_DAYS) * 100),
      consistencyPercent: elapsed ? Math.round((doneSoFar / elapsed) * 100) : null,
      currentStreak: current,
      bestStreak: best,
    };
  });
  return { startDate: start, todayDay, totalDays: TOTAL_DAYS, habits: list };
}

const parseId = (req) => {
  const id = Number(req.params.id);
  return Number.isInteger(id) ? id : null;
};
const owned = (id, userId) => db.prepare("SELECT * FROM habits WHERE id = ? AND user_id = ?").get(id, userId);

router.get("/", (req, res) => res.json(loadHabits(req.user.id)));

router.post("/", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Give the habit a name" });
  if (name.length > 40) return res.status(400).json({ error: "Habit names can be up to 40 characters" });
  const existing = db.prepare("SELECT color FROM habits WHERE user_id = ?").all(req.user.id);
  if (existing.length >= MAX_HABITS) return res.status(400).json({ error: `Maximum ${MAX_HABITS} habits allowed` });
  const used = new Set(existing.map((h) => h.color));
  const color = req.body?.color || HABIT_COLORS.find((c) => !used.has(c)) || HABIT_COLORS[existing.length % HABIT_COLORS.length];
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "Colour must be a hex value like #198754" });
  const info = db.prepare("INSERT INTO habits (user_id, name, color) VALUES (?, ?, ?)").run(req.user.id, name, color);
  res.status(201).json(db.prepare("SELECT * FROM habits WHERE id = ?").get(info.lastInsertRowid));
});

router.patch("/:id", (req, res) => {
  const id = parseId(req);
  const habit = id && owned(id, req.user.id);
  if (!habit) return res.status(404).json({ error: "Habit not found" });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : habit.name;
  const color = req.body?.color ?? habit.color;
  if (!name || name.length > 40) return res.status(400).json({ error: "Habit name must be 1-40 characters" });
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "Invalid colour" });
  db.prepare("UPDATE habits SET name = ?, color = ? WHERE id = ?").run(name, color, habit.id);
  res.json({ ...habit, name, color });
});

router.delete("/:id", (req, res) => {
  const id = parseId(req);
  if (!id || !owned(id, req.user.id)) return res.status(404).json({ error: "Habit not found" });
  db.prepare("DELETE FROM habits WHERE id = ?").run(id);
  res.sendStatus(204);
});

router.post("/:id/toggle", (req, res) => {
  const id = parseId(req);
  const habit = id && owned(id, req.user.id);
  if (!habit) return res.status(404).json({ error: "Habit not found" });
  const day = Number(req.body?.day);
  if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) return res.status(400).json({ error: "Day must be 1-90" });
  const row = db.prepare("SELECT * FROM habit_entries WHERE habit_id = ? AND day = ?").get(habit.id, day);
  let completed;
  if (row) {
    completed = row.completed ? 0 : 1;
    db.prepare("UPDATE habit_entries SET completed = ? WHERE id = ?").run(completed, row.id);
  } else {
    completed = 1;
    db.prepare("INSERT INTO habit_entries (habit_id, day, completed) VALUES (?, ?, 1)").run(habit.id, day);
  }
  res.json({ habitId: habit.id, day, completed: !!completed });
});

router.put("/settings/start", (req, res) => {
  const date = req.body?.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  }
  db.prepare(
    `INSERT INTO user_settings (user_id, habit_start_date) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET habit_start_date = excluded.habit_start_date`
  ).run(req.user.id, date);
  res.json(loadHabits(req.user.id));
});

router.get("/export/json", (req, res) => {
  res.setHeader("Content-Disposition", 'attachment; filename="habits-export.json"');
  res.json({ exportedAt: new Date().toISOString(), ...loadHabits(req.user.id) });
});

export default router;
