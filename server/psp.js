// PSP logs:
//  - Job Number Log: one row per job, with estimates (blank allowed), actuals and cumulative "To Date" figures
//  - Daily Time Log: start/stop/interruption/delta time, tied to a job
// Actual time of a job is never typed in: it is the sum of its Daily Time Log deltas.
import { Router } from "express";
import { db } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";

const router = Router();
router.use(requireAuth, requireRole("student"));

const PHASES = ["requirements", "design", "implementation", "testing", "documentation", "other"];
const KINDS = ["previous", "project"];
const STATUSES = ["planned", "in_progress", "done"];
const STANDARD_JOBS = [
  ["requirements", "Requirements analysis"],
  ["design", "Design"],
  ["implementation", "Implementation"],
  ["testing", "Testing"],
  ["documentation", "Documentation"],
];

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
const toMin = (t) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const blank = (v) => v === undefined || v === null || v === "";
const today = () => new Date().toISOString().slice(0, 10);

function optInt(v, label, max = 1_000_000) {
  if (blank(v)) return { val: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) return { error: `${label} must be a whole number from 0 to ${max}` };
  return { val: n };
}
function optNum(v, label) {
  if (blank(v)) return { val: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { error: `${label} must be a number, 0 or more` };
  return { val: n };
}

const jobOut = (j) => ({
  id: j.id, jobNo: j.job_no, project: j.project, kind: j.kind, phase: j.phase, name: j.name,
  estMinutes: j.est_minutes, estUnits: j.est_units, unitLabel: j.unit_label, actualUnits: j.actual_units,
  status: j.status, completedOn: j.completed_on, notes: j.notes,
  actualMinutes: j.actual_min ?? 0, entryCount: j.entry_count ?? 0,
});
const entryOut = (e) => ({
  id: e.id, jobId: e.job_id, jobNo: e.job_no, jobName: e.job_name, project: e.project, date: e.entry_date,
  start: e.start_time, stop: e.stop_time, interruptionMin: e.interruption_min, interruptionNote: e.interruption_note,
  deltaMin: e.delta_min, comments: e.comments,
});

const JOB_SQL = `
  SELECT j.*,
    COALESCE((SELECT SUM(e.delta_min) FROM psp_entries e WHERE e.job_id = j.id), 0) AS actual_min,
    (SELECT COUNT(*) FROM psp_entries e WHERE e.job_id = j.id) AS entry_count
  FROM psp_jobs j WHERE j.user_id = ?`;
const listJobs = (uid) => db.prepare(`${JOB_SQL} ORDER BY j.job_no`).all(uid).map(jobOut);
const ownJob = (id, uid) => db.prepare("SELECT * FROM psp_jobs WHERE id = ? AND user_id = ?").get(Number(id), uid);
const nextJobNo = (uid) => (db.prepare("SELECT COALESCE(MAX(job_no), 0) + 1 AS n FROM psp_jobs WHERE user_id = ?").get(uid).n);

function validateJob(b, base = {}) {
  const errors = [];
  const out = { ...base };
  const has = (k) => b[k] !== undefined;
  if (has("name")) {
    out.name = String(b.name).trim();
    if (!out.name) errors.push("Job name is required");
    if (out.name.length > 80) errors.push("Job name can be up to 80 characters");
  }
  if (has("project")) {
    out.project = String(b.project).trim() || "General";
    if (out.project.length > 60) errors.push("Project name can be up to 60 characters");
  }
  if (has("kind")) { if (!KINDS.includes(b.kind)) errors.push("Kind must be previous or project"); out.kind = b.kind; }
  if (has("phase")) { if (!PHASES.includes(b.phase)) errors.push("Unknown phase"); out.phase = b.phase; }
  if (has("status")) { if (!STATUSES.includes(b.status)) errors.push("Unknown status"); out.status = b.status; }
  if (has("unitLabel")) {
    out.unit_label = String(b.unitLabel).trim() || "LOC";
    if (out.unit_label.length > 20) errors.push("Unit label can be up to 20 characters");
  }
  if (has("estMinutes")) { const r = optInt(b.estMinutes, "Estimated time (minutes)", 100000); r.error ? errors.push(r.error) : (out.est_minutes = r.val); }
  if (has("estUnits")) { const r = optNum(b.estUnits, "Estimated units"); r.error ? errors.push(r.error) : (out.est_units = r.val); }
  if (has("actualUnits")) { const r = optNum(b.actualUnits, "Actual units"); r.error ? errors.push(r.error) : (out.actual_units = r.val); }
  if (has("completedOn")) {
    if (blank(b.completedOn)) out.completed_on = null;
    else if (!isDate(b.completedOn)) errors.push("Completed date must be YYYY-MM-DD");
    else out.completed_on = b.completedOn;
  }
  if (has("notes")) {
    out.notes = String(b.notes).trim() || null;
    if (out.notes && out.notes.length > 500) errors.push("Notes can be up to 500 characters");
  }
  if (out.status === "done" && !out.completed_on) out.completed_on = today();
  if (out.status !== "done" && has("status")) out.completed_on = has("completedOn") ? out.completed_on : null;
  return { errors, out };
}

/* ---------------- Job Number Log ---------------- */
router.get("/jobs", (req, res) => res.json(listJobs(req.user.id)));

router.post("/jobs", (req, res) => {
  const b = req.body ?? {};
  if (blank(b.name)) return res.status(400).json({ error: "Job name is required" });
  const { errors, out } = validateJob(b, { project: "General", kind: "project", phase: "other", status: "planned", unit_label: "LOC" });
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  const info = db
    .prepare(
      `INSERT INTO psp_jobs (user_id, job_no, project, kind, phase, name, est_minutes, est_units, unit_label, actual_units, status, completed_on, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.id, nextJobNo(req.user.id), out.project, out.kind, out.phase, out.name, out.est_minutes ?? null, out.est_units ?? null,
      out.unit_label, out.actual_units ?? null, out.status, out.completed_on ?? null, out.notes ?? null);
  res.status(201).json(listJobs(req.user.id).find((j) => j.id === Number(info.lastInsertRowid)));
});

// The five standard jobs for one project; estimates are left blank for the student to fill in.
router.post("/jobs/template", (req, res) => {
  const project = String(req.body?.project ?? "").trim();
  const kind = req.body?.kind === "previous" ? "previous" : "project";
  if (!project) return res.status(400).json({ error: "Enter a project name" });
  if (project.length > 60) return res.status(400).json({ error: "Project name can be up to 60 characters" });
  const existing = db.prepare("SELECT name FROM psp_jobs WHERE user_id = ? AND project = ?").all(req.user.id, project).map((r) => r.name);
  const add = STANDARD_JOBS.filter(([, name]) => !existing.includes(name));
  if (!add.length) return res.status(409).json({ error: `"${project}" already has all five standard jobs` });
  const ins = db.prepare("INSERT INTO psp_jobs (user_id, job_no, project, kind, phase, name) VALUES (?,?,?,?,?,?)");
  db.exec("BEGIN");
  try {
    for (const [phase, name] of add) ins.run(req.user.id, nextJobNo(req.user.id), project, kind, phase, name);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.status(201).json(listJobs(req.user.id));
});

router.patch("/jobs/:id", (req, res) => {
  const job = ownJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const { errors, out } = validateJob(req.body ?? {}, { ...job });
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });
  db.prepare(
    `UPDATE psp_jobs SET project=?, kind=?, phase=?, name=?, est_minutes=?, est_units=?, unit_label=?, actual_units=?, status=?, completed_on=?, notes=? WHERE id=?`
  ).run(out.project, out.kind, out.phase, out.name, out.est_minutes ?? null, out.est_units ?? null, out.unit_label, out.actual_units ?? null,
    out.status, out.completed_on ?? null, out.notes ?? null, job.id);
  res.json(listJobs(req.user.id).find((j) => j.id === job.id));
});

router.delete("/jobs/:id", (req, res) => {
  const job = ownJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  db.prepare("DELETE FROM psp_jobs WHERE id = ?").run(job.id); // its time entries are removed with it
  res.sendStatus(204);
});

/* ---------------- Daily Time Log ---------------- */
function validateEntry(b, uid, selfId = null) {
  const date = b.date, start = toMin(b.start), stop = toMin(b.stop);
  if (!isDate(date)) return { error: "Enter the date" };
  if (!ownJob(b.jobId, uid)) return { error: "Choose one of your jobs" };
  if (start === null || stop === null) return { error: "Enter start and stop times as HH:MM" };
  if (stop <= start) return { error: "Stop time must be after start time (split work that runs past midnight into two entries)" };
  const i = optInt(b.interruptionMin, "Interruption time", 1440);
  if (i.error) return { error: i.error };
  const interruption = i.val ?? 0;
  const elapsed = stop - start;
  if (interruption > elapsed) return { error: `Interruption time (${interruption} min) cannot be longer than the ${elapsed} minutes between start and stop` };
  const note = blank(b.interruptionNote) ? null : String(b.interruptionNote).trim().slice(0, 200);
  const comments = blank(b.comments) ? null : String(b.comments).trim().slice(0, 500);
  const clash = db
    .prepare("SELECT id, start_time, stop_time FROM psp_entries WHERE user_id = ? AND entry_date = ? AND id != ?")
    .all(uid, date, selfId ?? -1)
    .find((e) => toMin(e.start_time) < stop && toMin(e.stop_time) > start);
  if (clash) return { error: `This overlaps another entry on ${date} (${clash.start_time}-${clash.stop_time})` };
  return { val: { jobId: Number(b.jobId), date, start: b.start, stop: b.stop, interruption, note, comments, delta: elapsed - interruption } };
}

const ENTRY_SQL = `
  SELECT e.*, j.job_no, j.name AS job_name, j.project
  FROM psp_entries e JOIN psp_jobs j ON j.id = e.job_id WHERE e.user_id = ?`;

router.get("/entries", (req, res) => {
  const date = req.query.date;
  const rows = isDate(date)
    ? db.prepare(`${ENTRY_SQL} AND e.entry_date = ? ORDER BY e.start_time`).all(req.user.id, date)
    : db.prepare(`${ENTRY_SQL} ORDER BY e.entry_date DESC, e.start_time DESC LIMIT 1000`).all(req.user.id);
  res.json(rows.map(entryOut));
});

router.post("/entries", (req, res) => {
  const r = validateEntry(req.body ?? {}, req.user.id);
  if (r.error) return res.status(400).json({ error: r.error });
  const v = r.val;
  const info = db
    .prepare(
      `INSERT INTO psp_entries (user_id, job_id, entry_date, start_time, stop_time, interruption_min, interruption_note, delta_min, comments)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.id, v.jobId, v.date, v.start, v.stop, v.interruption, v.note, v.delta, v.comments);
  const row = db.prepare(`${ENTRY_SQL} AND e.id = ?`).get(req.user.id, Number(info.lastInsertRowid));
  // first logged time moves a planned job to in progress
  db.prepare("UPDATE psp_jobs SET status = 'in_progress' WHERE id = ? AND status = 'planned'").run(v.jobId);
  res.status(201).json(entryOut(row));
});

router.patch("/entries/:id", (req, res) => {
  const cur = db.prepare("SELECT * FROM psp_entries WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!cur) return res.status(404).json({ error: "Entry not found" });
  const merged = {
    jobId: cur.job_id, date: cur.entry_date, start: cur.start_time, stop: cur.stop_time,
    interruptionMin: cur.interruption_min, interruptionNote: cur.interruption_note, comments: cur.comments, ...req.body,
  };
  const r = validateEntry(merged, req.user.id, cur.id);
  if (r.error) return res.status(400).json({ error: r.error });
  const v = r.val;
  db.prepare(
    `UPDATE psp_entries SET job_id=?, entry_date=?, start_time=?, stop_time=?, interruption_min=?, interruption_note=?, delta_min=?, comments=? WHERE id=?`
  ).run(v.jobId, v.date, v.start, v.stop, v.interruption, v.note, v.delta, v.comments, cur.id);
  res.json(entryOut(db.prepare(`${ENTRY_SQL} AND e.id = ?`).get(req.user.id, cur.id)));
});

router.delete("/entries/:id", (req, res) => {
  const info = db.prepare("DELETE FROM psp_entries WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Entry not found" });
  res.sendStatus(204);
});

/* ---------------- Summary ---------------- */
router.get("/summary", (req, res) => {
  const uid = req.user.id;
  const jobs = listJobs(uid);
  const done = jobs.filter((j) => j.status === "done");

  const withEst = done.filter((j) => j.estMinutes && j.actualMinutes > 0);
  const accuracy = withEst.map((j) => ({
    jobNo: j.jobNo, name: j.name, project: j.project, estMinutes: j.estMinutes, actualMinutes: j.actualMinutes,
    errorPercent: Math.round(((j.actualMinutes - j.estMinutes) / j.estMinutes) * 1000) / 10,
  }));
  const avgAbsError = accuracy.length
    ? Math.round((accuracy.reduce((a, r) => a + Math.abs(r.errorPercent), 0) / accuracy.length) * 10) / 10 : null;

  // productivity per unit label (never mixes LOC with pages, etc.)
  const byUnit = {};
  for (const j of done) {
    if (j.actualUnits && j.actualMinutes > 0) {
      const u = (byUnit[j.unitLabel] ??= { unitLabel: j.unitLabel, units: 0, minutes: 0, jobs: 0 });
      u.units += j.actualUnits; u.minutes += j.actualMinutes; u.jobs++;
    }
  }
  const productivity = Object.values(byUnit).map((u) => ({ ...u, unitsPerHour: Math.round((u.units / (u.minutes / 60)) * 10) / 10 }));

  const perPhase = PHASES.map((phase) => {
    const js = jobs.filter((j) => j.phase === phase);
    return { phase, jobs: js.length, estMinutes: js.reduce((a, j) => a + (j.estMinutes ?? 0), 0), actualMinutes: js.reduce((a, j) => a + j.actualMinutes, 0) };
  }).filter((p) => p.jobs > 0);

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const rows = db.prepare("SELECT entry_date AS d, SUM(delta_min) AS m FROM psp_entries WHERE user_id = ? AND entry_date >= ? GROUP BY entry_date").all(uid, days[0]);
  const byDay = Object.fromEntries(rows.map((r) => [r.d, r.m]));

  res.json({
    totals: {
      jobs: jobs.length, done: done.length,
      actualMinutes: jobs.reduce((a, j) => a + j.actualMinutes, 0),
      estMinutes: jobs.reduce((a, j) => a + (j.estMinutes ?? 0), 0),
      entries: db.prepare("SELECT COUNT(*) AS n FROM psp_entries WHERE user_id = ?").get(uid).n,
    },
    accuracy, avgAbsError, productivity, perPhase,
    daily: days.map((date) => ({ date, minutes: byDay[date] ?? 0 })),
  });
});

/* ---------------- Sticky notes ---------------- */
const NOTE_COLORS = ["yellow", "green", "blue", "pink", "purple", "white"];
const NOTE_SQL = `
  SELECT n.*, j.job_no, j.name AS job_name FROM psp_notes n
  LEFT JOIN psp_jobs j ON j.id = n.job_id WHERE n.user_id = ?`;
const noteOut = (n) => ({
  id: n.id, body: n.body, color: n.color, pinned: !!n.pinned, jobId: n.job_id,
  jobNo: n.job_no ?? null, jobName: n.job_name ?? null, createdAt: n.created_at, updatedAt: n.updated_at,
});
const getNote = (id, uid) => db.prepare(`${NOTE_SQL} AND n.id = ?`).get(uid, Number(id));

function noteFields(b, uid, base = {}) {
  const out = { ...base };
  if (b.body !== undefined) {
    out.body = String(b.body ?? "");
    if (out.body.length > 5000) return { error: "A note can be up to 5000 characters" };
  }
  if (b.color !== undefined) {
    if (!NOTE_COLORS.includes(b.color)) return { error: "Pick one of the note colours" };
    out.color = b.color;
  }
  if (b.pinned !== undefined) out.pinned = b.pinned ? 1 : 0;
  if (b.jobId !== undefined) {
    if (blank(b.jobId)) out.job_id = null;
    else if (!ownJob(b.jobId, uid)) return { error: "That job does not exist" };
    else out.job_id = Number(b.jobId);
  }
  return { out };
}

router.get("/notes", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  let rows = db.prepare(`${NOTE_SQL} ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC`).all(req.user.id);
  if (q) rows = rows.filter((n) => n.body.toLowerCase().includes(q) || (n.job_name ?? "").toLowerCase().includes(q));
  res.json(rows.map(noteOut));
});

router.post("/notes", (req, res) => {
  const { out, error } = noteFields(req.body ?? {}, req.user.id, { body: "", color: "yellow", pinned: 0, job_id: null });
  if (error) return res.status(400).json({ error });
  const info = db.prepare("INSERT INTO psp_notes (user_id, job_id, body, color, pinned) VALUES (?, ?, ?, ?, ?)")
    .run(req.user.id, out.job_id, out.body, out.color, out.pinned);
  res.status(201).json(noteOut(getNote(info.lastInsertRowid, req.user.id)));
});

router.patch("/notes/:id", (req, res) => {
  const cur = getNote(req.params.id, req.user.id);
  if (!cur) return res.status(404).json({ error: "Note not found" });
  const { out, error } = noteFields(req.body ?? {}, req.user.id, { body: cur.body, color: cur.color, pinned: cur.pinned, job_id: cur.job_id });
  if (error) return res.status(400).json({ error });
  db.prepare("UPDATE psp_notes SET body = ?, color = ?, pinned = ?, job_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(out.body, out.color, out.pinned, out.job_id, cur.id, req.user.id);
  res.json(noteOut(getNote(cur.id, req.user.id)));
});

router.delete("/notes/:id", (req, res) => {
  const info = db.prepare("DELETE FROM psp_notes WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Note not found" });
  res.json({ ok: true });
});

export default router;
