import { Router } from "express";
import { db } from "./db.js";
import { requireAuth, requireRole } from "./auth.js";
import { buildSummary } from "./gpa.js";
import { loadHabits, TOTAL_DAYS } from "./habits.js";
import { semesterName, ALL_SEMESTERS } from "./scale.js";

const LETTER_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

// PSP totals for one student: jobs, finished jobs, all logged minutes and today's minutes.
function pspTotals(uid) {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM psp_jobs WHERE user_id = @u) AS jobs,
         (SELECT COUNT(*) FROM psp_jobs WHERE user_id = @u AND status = 'done') AS done,
         COALESCE((SELECT SUM(delta_min) FROM psp_entries WHERE user_id = @u), 0) AS minutes,
         COALESCE((SELECT SUM(delta_min) FROM psp_entries WHERE user_id = @u AND entry_date = @d), 0) AS todayMinutes`
    )
    .get({ u: uid, d: new Date().toISOString().slice(0, 10) });
}

/* ---------------- Student ---------------- */
export const studentAnalytics = Router();
studentAnalytics.use(requireAuth, requireRole("student"));

studentAnalytics.get("/", (req, res) => {
  const uid = req.user.id;
  const gpa = buildSummary(uid);
  const habitData = loadHabits(uid);

  const courses = db.prepare("SELECT * FROM gpa_courses WHERE user_id = ?").all(uid);
  const distribution = LETTER_ORDER.map((letter) => ({
    letter,
    count: courses.filter((c) => c.status === "completed" && c.grade === letter).length,
  }));

  const gpaTrend = ALL_SEMESTERS.filter((s) => gpa.semesters[s] !== null).map((s) => ({
    label: s, name: semesterName(s), gpa: gpa.semesters[s],
  }));

  // Habit activity: completions per 7-day block of the 90-day period
  const weeks = Math.ceil(TOTAL_DAYS / 7);
  const weekly = Array.from({ length: weeks }, (_, i) => ({ week: i + 1, completions: 0 }));
  for (const h of habitData.habits) for (const d of h.completedDays) weekly[Math.floor((d - 1) / 7)].completions++;

  // Insights - only statements the data supports
  const insights = [];
  if (gpaTrend.length >= 2) {
    const a = gpaTrend[gpaTrend.length - 2], b = gpaTrend[gpaTrend.length - 1];
    const diff = Math.round((b.gpa - a.gpa) * 100) / 100;
    if (diff > 0) insights.push(`Your GPA went up ${diff.toFixed(2)} from ${a.label} to ${b.label}.`);
    else if (diff < 0) insights.push(`Your GPA dropped ${Math.abs(diff).toFixed(2)} from ${a.label} to ${b.label}.`);
    else insights.push(`Your GPA held steady at ${b.gpa.toFixed(2)} between ${a.label} and ${b.label}.`);
  }
  if (gpa.creditsRemaining > 0 && gpa.creditsEarned > 0) {
    insights.push(`${gpa.creditsRemaining} credits are still unplanned out of ${gpa.requiredCredits} required.`);
  }
  if (habitData.habits.length) {
    const top = [...habitData.habits].sort((x, y) => y.totalCompleted - x.totalCompleted)[0];
    if (top.totalCompleted) insights.push(`"${top.name}" is your most consistent habit with ${top.totalCompleted} of ${TOTAL_DAYS} days done.`);
    const bestStreak = [...habitData.habits].sort((x, y) => y.bestStreak - x.bestStreak)[0];
    if (bestStreak.bestStreak >= 2) insights.push(`Your longest streak is ${bestStreak.bestStreak} days on "${bestStreak.name}".`);
    if (habitData.todayDay) {
      const idle = habitData.habits.filter((h) => !h.completedDays.some((d) => d > habitData.todayDay - 3 && d <= habitData.todayDay));
      if (idle.length) insights.push(`No check-ins in the last 3 days for: ${idle.map((h) => h.name).join(", ")}.`);
    }
  }
  const psp = pspTotals(uid);
  if (psp.minutes > 0) insights.push(`You have logged ${Math.floor(psp.minutes / 60)}h ${String(psp.minutes % 60).padStart(2, "0")}m across ${psp.jobs} PSP job${psp.jobs === 1 ? "" : "s"} (${psp.done} done).`);

  res.json({
    gpa: { cumulative: gpa.cumulativeGPA, trend: gpaTrend, distribution },
    credits: {
      earned: gpa.creditsEarned, inProgress: gpa.creditsInProgress,
      remaining: gpa.creditsRemaining, required: gpa.requiredCredits,
    },
    habits: {
      startDate: habitData.startDate, todayDay: habitData.todayDay,
      perHabit: habitData.habits.map((h) => ({
        name: h.name, color: h.color, completionPercent: h.completionPercent,
        consistencyPercent: h.consistencyPercent, currentStreak: h.currentStreak, bestStreak: h.bestStreak,
        totalCompleted: h.totalCompleted,
      })),
      weekly,
    },
    psp,
    insights,
  });
});

/* ---------------- Student dashboard (First / Second Semester) ---------------- */
export const studentDashboard = Router();
studentDashboard.use(requireAuth, requireRole("student"));

studentDashboard.get("/", (req, res) => {
  const uid = req.user.id;
  const gpa = buildSummary(uid);
  const habits = loadHabits(uid);
  const courses = db.prepare("SELECT * FROM gpa_courses WHERE user_id = ? ORDER BY year, semester, code").all(uid);

  // Group by semester NAME ("First Semester" / "Second Semester") instead of Fall / Spring
  const groups = { "First Semester": [], "Second Semester": [] };
  const target = gpa.currentSemester;
  for (const c of courses) {
    if (!c.semester || c.semester !== target) continue;
    groups[semesterName(c.semester)]?.push(c);
  }
  const inProgress = courses.filter((c) => c.status === "inprogress");

  res.json({
    user: { id: req.user.id, name: req.user.name, studentId: req.user.student_id },
    gpa: {
      cumulative: gpa.cumulativeGPA, currentSemester: gpa.currentSemester,
      currentSemesterName: gpa.currentSemesterName, currentSemesterGPA: gpa.currentSemesterGPA,
      creditsEarned: gpa.creditsEarned, creditsInProgress: gpa.creditsInProgress,
      progressPercent: gpa.progressPercent, required: gpa.requiredCredits,
      semesterGPAs: Object.entries(gpa.semesters)
        .filter(([, v]) => v !== null)
        .map(([label, v]) => ({ label, name: semesterName(label), gpa: v })),
    },
    semesterCourses: groups,
    inProgressCourses: inProgress.map((c) => ({ ...c, semesterName: semesterName(c.semester) })),
    psp: pspTotals(uid),
    habits: {
      count: habits.habits.length, todayDay: habits.todayDay, started: !!habits.startDate,
      bestCurrentStreak: Math.max(0, ...habits.habits.map((h) => h.currentStreak)),
      doneToday: habits.todayDay
        ? habits.habits.filter((h) => h.completedDays.includes(habits.todayDay)).length
        : 0,
    },
  });
});
