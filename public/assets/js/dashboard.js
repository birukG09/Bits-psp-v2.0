(async function () {
  const { api, esc, toast } = Bits;
  const $ = (id) => document.getElementById(id);
  const gpa = (v) => (v === null || v === undefined ? "--" : Number(v).toFixed(2));

  const user = await Bits.requireLogin("student");
  $("firstName").textContent = user.name.split(" ")[0];

  async function load() {
    const d = await api("/dashboard");

    $("statGPA").textContent = gpa(d.gpa.cumulative);
    $("statSemGPA").textContent = gpa(d.gpa.currentSemesterGPA);
    $("statSemLabel").textContent = d.gpa.currentSemesterName ? `${d.gpa.currentSemesterName} GPA` : "Current semester GPA";
    $("statCredits").textContent = d.gpa.creditsEarned;
    $("statCreditsLabel").textContent = `Credits earned of ${d.gpa.required}`;

    if (!d.habits.count) {
      $("statHabits").textContent = "--";
      $("statHabitsLabel").innerHTML = '<a href="habit-tracker.html">Add your first habit</a>';
    } else if (!d.habits.started) {
      $("statHabits").textContent = `0/${d.habits.count}`;
      $("statHabitsLabel").innerHTML = '<a href="habit-tracker.html">Start the 90-day tracker</a>';
    } else {
      $("statHabits").textContent = `${d.habits.doneToday}/${d.habits.count}`;
      $("statHabitsLabel").textContent = d.habits.bestCurrentStreak
        ? `Habits done today · ${d.habits.bestCurrentStreak}-day streak`
        : "Habits done today";
    }

    // Semester GPA cards: always named First Semester / Second Semester
    const cards = $("semesterCards");
    cards.innerHTML = "";
    $("semesterEmpty").classList.toggle("d-none", d.gpa.semesterGPAs.length > 0);
    for (const s of d.gpa.semesterGPAs) {
      const col = document.createElement("div");
      col.className = "col-md-6";
      col.innerHTML = `
        <div class="border rounded p-3 h-100">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="fw-semibold">${esc(s.name)}</div>
              <small class="text-muted">${esc(s.label.replace(/^\d(st|nd) Semester /, ""))}</small>
            </div>
            <span class="badge bg-primary fs-6">${gpa(s.gpa)}</span>
          </div>
        </div>`;
      cards.appendChild(col);
    }

    // In progress
    const body = $("inProgressBody");
    body.innerHTML = d.inProgressCourses.length
      ? d.inProgressCourses
          .map((c) => `<tr><td class="fw-semibold">${esc(c.code)}</td><td>${esc(c.title)}</td>
            <td>${esc(c.semesterName || "Not set")}</td><td>${c.credits}</td></tr>`)
          .join("")
      : `<tr><td colspan="4" class="empty-hint p-3">No courses in progress.</td></tr>`;

    // Graduation
    $("gradBar").style.width = `${d.gpa.progressPercent}%`;
    $("gradBar").textContent = d.gpa.progressPercent >= 10 ? `${d.gpa.progressPercent}%` : "";
    $("gradText").textContent = `${d.gpa.creditsEarned} earned · ${d.gpa.creditsInProgress} in progress · ${d.gpa.required} required`;

    // PSP summary
    const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
    $("pspJobs").textContent = `${d.psp.done} of ${d.psp.jobs}`;
    $("pspToday").textContent = hm(d.psp.todayMinutes);
    $("pspTotal").textContent = hm(d.psp.minutes);
  }

  load().catch((e) => toast(e.message, "error"));
})();
