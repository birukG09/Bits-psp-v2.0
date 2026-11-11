# BiTS Connect

A student developer portal for BiTS College Software Engineering students. Its main feature is a **PSP Tracker**: a Job Number Log and Daily Time Logs for recording and tracking programming work. It also has a GPA tracker, a 90-day habit tracker and analytics.

**Author:** Biruk Gebre (Ugr/0113/24), Software Engineering, BiTS College, Addis Ababa.

## Features

- **PSP Tracker** (home page after sign-in), containing:
  - **Job Number Log**: job number, estimated and actual time and units, and running "To Date" totals. Jobs can be previous work or part of a new project. Estimates are optional. "Add standard jobs" creates requirements analysis, design, implementation, testing and documentation for a project.
  - **Daily Time Logs**: date, start, stop, interruption time, delta time and comments. Entries on the same day cannot overlap, and a start/stop timer fills in an entry for you. Actual job time is always the sum of its Daily Time Log entries.
  - A summary (time per day, estimated vs actual, estimate accuracy, productivity per unit), CSV export, and sticky notes that can be linked to a job.
- **GPA Tracker:** courses with credits and BiTS letter grades. GPA per semester, per year and cumulative is calculated on the server. Includes the Software Engineering curriculum from the BiTS College Undergraduate Student Handbook (`server/curriculum.json`), a what-if GPA calculator and a target-GPA planner.
- **Habit Tracker:** a circular 90-day ring with one ring per habit, streaks and JSON export (up to 10 habits).
- **Dashboard and Analytics:** GPA trend, grade distribution, habit completion and PSP time logged.

## Demo data

On the first start with an empty database, a demo student is created: **Biruk Gebre, Ugr/0113/24**.

- Sign in with `biruk.gebre@bits.edu` / `demo12345`.
- PSP: 5 previous-work jobs and a Student Grade Management System sprint from the last 7 days (requirements, design, implementation and testing done, documentation in progress), 21 Daily Time Log entries and 5 notes.
- GPA: 20 completed courses over 5 semesters, 4 in progress and 2 planned.
- Habits: 5 habits that started 7 days ago.

Dates are relative to today. Set `NO_DEMO=1` to start with an empty database, or run `npm run seed -- --reset` to rebuild the demo account. You can also register your own account.

## Run it

Needs Node 22.13 or newer (uses the built-in `node:sqlite`).

```bash
npm install
npm start          # http://localhost:3000   (PORT=4000 npm start to change)
```

The pages load Bootstrap, Bootstrap Icons and Chart.js from the jsDelivr CDN, so the browser needs internet access.

## Layout

```
server/      Express API (auth, gpa, habits, psp, analytics), SQLite schema and demo seed
public/      HTML pages, assets/css/custom.css, assets/js/*, assets/img/*
data/        created on first run (database), git-ignored
```
