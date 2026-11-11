import { Router } from "express";
import { db } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";
import {
  GRADE_POINTS, REQUIRED_CREDITS, SEMESTERS_BY_YEAR, ALL_SEMESTERS, gradePoints, semesterName,
} from "./scale.js";
import { PROGRAMS } from "./curriculum.js";

const router = Router();
router.use(requireAuth, requireRole("student"));

const STATUSES = ["completed", "inprogress", "planned"];

function weighted(rows) {
  const graded = rows.filter((c) => c.status === "completed" && c.grade && gradePoints(c.grade) !== null);
  const credits = graded.reduce((a, c) => a + c.credits, 0);
  if (!credits) return null;
  const pts = graded.reduce((a, c) => a + gradePoints(c.grade) * c.credits, 0);
  return Math.round((pts / credits) * 100) / 100;
}

export function buildSummary(userId) {
  const courses = db.prepare("SELECT * FROM gpa_courses WHERE user_id = ? ORDER BY year, semester, code").all(userId);
  const completed = courses.filter((c) => c.status === "completed");
  const earned = completed.filter((c) => c.grade && gradePoints(c.grade) >= 1.75).reduce((a, c) => a + c.credits, 0);
  const inProgress = courses.filter((c) => c.status === "inprogress").reduce((a, c) => a + c.credits, 0);
  const remaining = Math.max(0, REQUIRED_CREDITS - earned - inProgress);

  const semesters = {};
  for (const label of ALL_SEMESTERS) semesters[label] = weighted(courses.filter((c) => c.semester === label));
  const years = {};
  for (const y of [1, 2, 3, 4]) years[y] = weighted(courses.filter((c) => c.year === y));

  // "current term" = the latest semester (in curriculum order) that already has a GPA
  const lastGraded = [...ALL_SEMESTERS].reverse().find((s) => semesters[s] !== null) ?? null;

  return {
    cumulativeGPA: weighted(courses),
    creditsEarned: earned,
    creditsInProgress: inProgress,
    creditsRemaining: remaining,
    requiredCredits: REQUIRED_CREDITS,
    progressPercent: Math.min(100, Math.round((earned / REQUIRED_CREDITS) * 100)),
    currentSemester: lastGraded,
    currentSemesterName: semesterName(lastGraded),
    currentSemesterGPA: lastGraded ? semesters[lastGraded] : null,
    semesters,
    years,
    coursesTaken: completed.length,
    coursesPlanned: courses.filter((c) => c.status !== "completed").length,
    semestersByYear: SEMESTERS_BY_YEAR,
  };
}

function validate(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has("code")) {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) errors.push("Course code is required");
    out.code = code;
  }
  if (!partial || has("title")) {
    const title = String(body.title ?? "").trim();
    if (!title) errors.push("Course title is required");
    out.title = title;
  }
  if (!partial || has("credits")) {
    const credits = Number(body.credits);
    if (!Number.isInteger(credits) || credits < 1 || credits > 6) errors.push("Credits must be a whole number from 1 to 6");
    out.credits = credits;
  }
  if (!partial || has("status")) {
    const status = body.status ?? "completed";
    if (!STATUSES.includes(status)) errors.push("Invalid status");
    out.status = status;
  }
  if (has("grade")) {
    const grade = body.grade || null;
    if (grade && !(grade in GRADE_POINTS)) errors.push("Unknown letter grade");
    out.grade = grade;
  }
  if (has("year")) {
    const year = body.year === "" || body.year === null ? null : Number(body.year);
    if (year !== null && ![1, 2, 3, 4].includes(year)) errors.push("Year must be 1-4");
    out.year = year;
  }
  if (has("semester")) {
    const semester = body.semester || null;
    if (semester && !ALL_SEMESTERS.includes(semester)) errors.push("Unknown semester");
    out.semester = semester;
  }
  const status = out.status ?? body.status;
  if (status === "completed" && !partial && !out.grade) errors.push("A completed course needs a letter grade");
  return { errors, out };
}

router.get("/courses", (req, res) => {
  res.json(db.prepare("SELECT * FROM gpa_courses WHERE user_id = ? ORDER BY year, semester, code").all(req.user.id));
});

router.get("/summary", (req, res) => res.json(buildSummary(req.user.id)));

router.post("/courses", (req, res) => {
  const { errors, out } = validate(req.body ?? {});
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  try {
    const info = db
      .prepare(
        `INSERT INTO gpa_courses (user_id, code, title, credits, grade, status, year, semester)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.id, out.code, out.title, out.credits, out.grade ?? null, out.status, out.year ?? null, out.semester ?? null);
    res.status(201).json(db.prepare("SELECT * FROM gpa_courses WHERE id = ?").get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: `${out.code} is already in your list` });
    throw e;
  }
});

router.patch("/courses/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM gpa_courses WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Course not found" });
  const { errors, out } = validate(req.body ?? {}, { partial: true });
  const merged = { ...row, ...out };
  if (merged.status === "completed" && !merged.grade) errors.push("A completed course needs a letter grade");
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  db.prepare(
    "UPDATE gpa_courses SET title=?, credits=?, grade=?, status=?, year=?, semester=? WHERE id=?"
  ).run(merged.title, merged.credits, merged.grade ?? null, merged.status, merged.year ?? null, merged.semester ?? null, row.id);
  res.json(db.prepare("SELECT * FROM gpa_courses WHERE id = ?").get(row.id));
});

router.delete("/courses/:id", (req, res) => {
  const info = db.prepare("DELETE FROM gpa_courses WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Course not found" });
  res.sendStatus(204);
});

/* ---------------- Program curriculum (from the student handbook) ---------------- */
router.get("/curriculum", (_req, res) => res.json({ programs: { software_engineering: PROGRAMS.software_engineering } }));

// Adds every scheduled course of a program as "planned". Courses already in the list are left untouched.
// Elective courses are not added: the student picks those (9 credit hours needed).
router.post("/curriculum/load", (req, res) => {
  const program = req.body?.program === "software_engineering" ? PROGRAMS.software_engineering : null;
  if (!program) return res.status(400).json({ error: "Unknown program" });
  const insert = db.prepare(
    `INSERT OR IGNORE INTO gpa_courses (user_id, code, title, credits, grade, status, year, semester)
     VALUES (?, ?, ?, ?, NULL, 'planned', ?, ?)`
  );
  let added = 0, skipped = 0;
  db.exec("BEGIN");
  try {
    for (const c of program.courses.filter((x) => x.type !== "elective")) {
      const info = insert.run(req.user.id, c.code, c.title, c.credits, c.year, c.semesterLabel);
      if (info.changes) added++; else skipped++;
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ added, skipped });
});

export default router;
