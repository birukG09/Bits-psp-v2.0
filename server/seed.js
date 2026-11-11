// Demo data for one student (Biruk Gebre, Ugr/0113/24) so every page has something to show.
// Dates are relative to today, so the PSP summary, habit ring and dashboard always look current.
//   npm start            seeds the demo account automatically when the database has no users (NO_DEMO=1 turns this off)
//   npm run seed         creates the demo account if missing
//   npm run seed -- --reset   deletes the demo account and recreates it
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { hashPassword } from "./auth.js";

export const DEMO = { name: "Biruk Gebre", email: "biruk.gebre@bits.edu", password: "demo12345", studentId: "Ugr/0113/24" };

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// [code, title, credits, grade, status, year, semester]
const COURSES = [
  ["SE131", "Fundamentals of Programming", 3, "A", "completed", 1, "1st Semester 2022"],
  ["MT161", "Discrete Mathematics", 3, "B+", "completed", 1, "1st Semester 2022"],
  ["SP111", "College English I", 3, "A-", "completed", 1, "1st Semester 2022"],
  ["SE101", "Introduction to Computer Systems", 3, "A", "completed", 1, "1st Semester 2022"],
  ["SE132", "Object Oriented Programming", 3, "A", "completed", 1, "2nd Semester 2023"],
  ["SE104", "Introduction to Software Engineering", 3, "A-", "completed", 1, "2nd Semester 2023"],
  ["MT164", "Linear Algebra", 3, "B", "completed", 1, "2nd Semester 2023"],
  ["IT154", "Data Communication and Computer Networks I", 3, "B+", "completed", 1, "2nd Semester 2023"],
  ["SE233", "Data Structures and Algorithms", 3, "A-", "completed", 2, "1st Semester 2023"],
  ["SE241", "Fundamentals of Database Systems", 3, "A", "completed", 2, "1st Semester 2023"],
  ["SE223", "Software Requirements Engineering", 3, "B+", "completed", 2, "1st Semester 2023"],
  ["MT261", "Calculus", 3, "B", "completed", 2, "1st Semester 2023"],
  ["SE226", "Software Design and Architecture", 3, "A-", "completed", 2, "2nd Semester 2024"],
  ["SE252", "Operating Systems", 3, "B+", "completed", 2, "2nd Semester 2024"],
  ["SE224", "Process Modeling and Workflow Design", 3, "A", "completed", 2, "2nd Semester 2024"],
  ["SP218", "General Psychology", 3, "A-", "completed", 2, "2nd Semester 2024"],
  ["SE381", "Web Systems and Services", 3, "A", "completed", 3, "1st Semester 2024"],
  ["SE331", "Mobile Application Development", 3, "A", "completed", 3, "1st Semester 2024"],
  ["SE327", "Enterprise Systems", 3, "A-", "completed", 3, "1st Semester 2024"],
  ["MT361", "Statistical Methods", 3, "B+", "completed", 3, "1st Semester 2024"],
  ["SE322", "Software Quality Assurance and Testing", 3, null, "inprogress", 3, "2nd Semester 2025"],
  ["SE324", "Software Usability and Management", 3, null, "inprogress", 3, "2nd Semester 2025"],
  ["SE376", "Software Project Management", 3, null, "inprogress", 3, "2nd Semester 2025"],
  ["SE366", "Methods for Software Engineering Research", 3, null, "inprogress", 3, "2nd Semester 2025"],
  ["SE491", "Software Engineering Capstone Project I", 4, null, "planned", 4, "1st Semester 2025"],
  ["SE421", "Systems Thinking and Systems Approach", 3, null, "planned", 4, "1st Semester 2025"],
];

const PREV = "Previous work";
const SGMS = "Student Grade Management System";
// Job numbers follow this order. Previous work comes first (older), then this week's Student Grade Management System sprint.
const JOBS = [
  { project: PREV, kind: "previous", phase: "implementation", name: "Console calculator (Fundamentals of Programming)", estMin: null, estUnits: null, unit: "LOC", actual: 180, status: "done", doneOn: -61 },
  { project: PREV, kind: "previous", phase: "implementation", name: "Samrawi Ride carpooling simulation (Java OOP)", estMin: 240, estUnits: 600, unit: "LOC", actual: 720, status: "done", doneOn: -35 },
  { project: PREV, kind: "previous", phase: "implementation", name: "Exception handling module (group University Management System)", estMin: null, estUnits: 300, unit: "LOC", actual: 350, status: "done", doneOn: -25 },
  { project: PREV, kind: "previous", phase: "implementation", name: "Login and registration screens (Mobile Application Development)", estMin: 180, estUnits: 220, unit: "LOC", actual: 260, status: "done", doneOn: -12 },
  { project: PREV, kind: "previous", phase: "testing", name: "Test plan (Software Quality Assurance and Testing)", estMin: 120, estUnits: 10, unit: "test cases", actual: 12, status: "done", doneOn: -9 },
  { project: SGMS, kind: "project", phase: "requirements", name: "Requirements analysis", estMin: 90, estUnits: 12, unit: "requirements", actual: 14, status: "done", doneOn: -7 },
  { project: SGMS, kind: "project", phase: "design", name: "Design", estMin: 120, estUnits: 4, unit: "diagrams", actual: 5, status: "done", doneOn: -6 },
  { project: SGMS, kind: "project", phase: "implementation", name: "Implementation", estMin: 300, estUnits: 250, unit: "LOC", actual: 310, status: "done", doneOn: -3 },
  { project: SGMS, kind: "project", phase: "testing", name: "Testing", estMin: 120, estUnits: 15, unit: "test cases", actual: 16, status: "done", doneOn: -1 },
  { project: SGMS, kind: "project", phase: "documentation", name: "Documentation", estMin: 90, estUnits: 6, unit: "pages", actual: 3, status: "in_progress", doneOn: null },
];

// [job number, day offset, start, stop, interruption min, interruption note, comments]
const ENTRIES = [
  [1, -62, "10:00", "12:00", 10, "Phone call", "Menu loop and arithmetic functions"],
  [1, -61, "09:00", "10:30", 0, null, "Input checks and testing"],
  [2, -36, "14:00", "17:00", 20, "Dinner break", "Class design: Driver, Rider, Trip"],
  [2, -35, "09:00", "12:30", 15, "Power cut", "Trip matching and console menus"],
  [3, -25, "15:00", "18:00", 30, "Group call", "Custom exceptions and propagation chain"],
  [4, -13, "14:00", "16:30", 10, "Message", "Login form and field validation"],
  [4, -12, "09:00", "11:00", 0, null, "Registration screen and navigation"],
  [5, -10, "15:00", "17:00", 15, "Class", "Test scenarios for login and registration"],
  [5, -9, "10:00", "11:30", 0, null, "Expected results and test data"],
  [6, -7, "09:00", "10:15", 5, "Message", "Listed inputs, outputs and validation rules"],
  [6, -7, "11:00", "11:45", 0, null, "Reviewed the requirements list"],
  [7, -6, "09:00", "10:30", 10, "Coffee", "Class diagram and data flow"],
  [7, -6, "14:00", "14:50", 0, null, "Flow of grade calculation, design review"],
  [8, -5, "09:00", "11:30", 15, "Lunch delivery", "Student class, mark input and average"],
  [8, -4, "09:00", "10:45", 10, "Class", "Letter grade calculation"],
  [8, -3, "10:00", "11:30", 0, null, "Result display and cleanup"],
  [9, -2, "09:00", "10:30", 5, "Message", "Valid mark test cases"],
  [9, -1, "10:00", "11:00", 0, null, "Boundary marks (0, 100, -1, 101)"],
  [9, -1, "14:00", "14:40", 0, null, "Fixed the negative mark validation bug"],
  [10, -1, "16:00", "16:45", 0, null, "User guide outline"],
  [10, 0, "08:00", "08:50", 0, null, "Test report draft"],
];

const NOTES = [
  { job: 9, color: "yellow", pinned: 1, body: "Testing took about 50% longer than estimated. Add buffer for fixing bugs found during testing in the next estimate." },
  { job: 8, color: "green", pinned: 0, body: "Grade bands: A 90+, B 80-89, C 70-79, D 60-69, F below 60. Keep them in one place in the code." },
  { job: null, color: "blue", pinned: 0, body: "After every job: record actual units and check the To Date totals." },
  { job: 10, color: "pink", pinned: 0, body: "Documentation: user guide, test report and a short design summary. Estimate was 6 pages." },
  { job: 6, color: "purple", pinned: 0, body: "Requirements took 28% over the estimate. Count validation rules as separate requirements next time." },
];

// Day 1 of the 90 days was 7 days ago, so today is day 8. Each habit lists the days it was done.
const HABIT_TODAY = 8;
const HABITS = [
  { name: "Code 2 hours", color: "#198754", days: [1, 2, 3, 4, 6, 7, 8] },
  { name: "Log PSP time", color: "#d97706", days: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: "Review estimates", color: "#7c3aed", days: [1, 2, 3, 5, 6, 8] },
  { name: "Read 20 pages", color: "#0891b2", days: [1, 2, 4, 5, 7] },
  { name: "Exercise 30 min", color: "#db2777", days: [1, 3, 4, 6, 7] },
];

export function seedDemo({ reset = false, onlyIfEmpty = false } = {}) {
  if (onlyIfEmpty && db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0) return null;
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO.email);
  if (existing && !reset) return { created: false, ...DEMO };
  if (existing) db.prepare("DELETE FROM users WHERE id = ?").run(existing.id); // cascades to all of the student's data

  db.exec("BEGIN");
  try {
    const uid = Number(
      db.prepare("INSERT INTO users (name, email, password_hash, role, student_id, program) VALUES (?,?,?,?,?,?)")
        .run(DEMO.name, DEMO.email, hashPassword(DEMO.password), "student", DEMO.studentId, "software_engineering").lastInsertRowid
    );

    const addCourse = db.prepare("INSERT INTO gpa_courses (user_id, code, title, credits, grade, status, year, semester) VALUES (?,?,?,?,?,?,?,?)");
    for (const c of COURSES) addCourse.run(uid, ...c);

    const addJob = db.prepare(
      `INSERT INTO psp_jobs (user_id, job_no, project, kind, phase, name, est_minutes, est_units, unit_label, actual_units, status, completed_on)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const jobId = {};
    JOBS.forEach((j, i) => {
      jobId[i + 1] = Number(addJob.run(uid, i + 1, j.project, j.kind, j.phase, j.name, j.estMin, j.estUnits, j.unit, j.actual, j.status, j.doneOn === null ? null : iso(j.doneOn)).lastInsertRowid);
    });

    const addEntry = db.prepare(
      `INSERT INTO psp_entries (user_id, job_id, entry_date, start_time, stop_time, interruption_min, interruption_note, delta_min, comments)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    for (const [no, off, start, stop, intr, note, comments] of ENTRIES) {
      addEntry.run(uid, jobId[no], iso(off), start, stop, intr, note, toMin(stop) - toMin(start) - intr, comments);
    }

    const addNote = db.prepare("INSERT INTO psp_notes (user_id, job_id, body, color, pinned) VALUES (?,?,?,?,?)");
    for (const n of NOTES) addNote.run(uid, n.job ? jobId[n.job] : null, n.body, n.color, n.pinned);

    db.prepare("INSERT INTO user_settings (user_id, habit_start_date) VALUES (?, ?)").run(uid, iso(-(HABIT_TODAY - 1)));
    const addHabit = db.prepare("INSERT INTO habits (user_id, name, color) VALUES (?,?,?)");
    const addDay = db.prepare("INSERT INTO habit_entries (habit_id, day, completed) VALUES (?,?,1)");
    for (const h of HABITS) {
      const hid = Number(addHabit.run(uid, h.name, h.color).lastInsertRowid);
      for (const d of h.days) addDay.run(hid, d);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { created: true, ...DEMO };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = seedDemo({ reset: process.argv.includes("--reset") });
  console.log(r.created ? "Demo account created." : "Demo account already exists (use --reset to recreate it).");
  console.log(`Sign in with ${r.email} / ${r.password}`);
}
