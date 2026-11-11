(async function () {
  const { api, esc, toast } = Bits;
  const $ = (id) => document.getElementById(id);

  const POINTS = { "A+": 4, A: 4, "A-": 3.7, "B+": 3.5, B: 3, "B-": 2.7, "C+": 2.5, C: 2, "C-": 1.75, D: 1, F: 0 };
  const STATUS_LABEL = { completed: "Completed", inprogress: "In Progress", planned: "Planned" };
  const STATUS_BADGE = { completed: "bg-success", inprogress: "bg-info", planned: "bg-secondary" };

  const user = await Bits.requireLogin("student");
  $("programSelect").value = user.program || "software_engineering";

  let courses = [];
  let summary = null;
  let statusFilter = "all";
  let chart = null;
  let catalog = null; // handbook curriculum
  const openYears = new Set(["cur-y1"]);

  const gpa = (v) => (v === null || v === undefined ? "--" : Number(v).toFixed(2));

  async function refresh() {
    [courses, summary] = await Promise.all([api("/gpa/courses"), api("/gpa/summary")]);
    renderSummary();
    renderTable();
    renderChart();
    renderCurriculum();
    renderYearCourses();
    recalc();
  }

  function renderSummary() {
    const s = summary;
    $("currentGPA").textContent = gpa(s.cumulativeGPA);
    $("totalCredits").textContent = s.creditsEarned;
    $("semesterGPA").textContent = gpa(s.currentSemesterGPA);
    $("semesterGPALabel").textContent = s.currentSemester ? `${s.currentSemesterName} · ${s.currentSemester.replace(/^\d(st|nd) Semester /, "")}` : "Latest graded term";
    $("graduationProgress").textContent = `${s.progressPercent}%`;
    $("creditsRemaining").textContent = `${s.creditsRemaining} credits remaining`;
    $("progressBar").style.width = `${s.progressPercent}%`;
    $("progressBar").textContent = s.progressPercent >= 25 ? `${s.creditsEarned}/${s.requiredCredits} Credits` : "";
    $("progressBar").title = `${s.creditsEarned}/${s.requiredCredits} credits`;
    $("creditsCompleted").textContent = s.creditsEarned;
    $("creditsInProgress").textContent = s.creditsInProgress;
    $("creditsLeft").textContent = s.creditsRemaining;
    $("creditsRequired").textContent = s.requiredCredits;
    $("programCompleted").textContent = s.coursesTaken;
    $("programRemaining").textContent = s.coursesPlanned;

    for (const y of [1, 2, 3, 4]) {
      const [first, second] = s.semestersByYear[y];
      $(`year${y}sem1GPA`).textContent = gpa(s.semesters[first]);
      $(`year${y}sem2GPA`).textContent = gpa(s.semesters[second]);
      $(`year${y}GPA`).textContent = gpa(s.years[y]);
    }
  }

  function visibleCourses() {
    const year = $("yearFilter").value;
    const sem = $("semesterFilter").value;
    return courses.filter(
      (c) =>
        (statusFilter === "all" || c.status === statusFilter) &&
        (!year || String(c.year) === year) &&
        (!sem || c.semester === sem)
    );
  }

  function renderTable() {
    const rows = visibleCourses();
    $("coursesTableBody").innerHTML = rows.length
      ? rows
          .map(
            (c) => `<tr>
          <td class="fw-semibold">${esc(c.code)}</td>
          <td>${esc(c.title)}</td>
          <td>${c.year ? `Year ${c.year}` : '<span class="text-muted">-</span>'}</td>
          <td>${c.semester ? esc(c.semester) : '<span class="text-muted">-</span>'}</td>
          <td>${c.credits}</td>
          <td>${c.grade ? `<span class="badge bg-primary">${esc(c.grade)}</span>` : '<span class="text-muted">-</span>'}</td>
          <td>${c.grade ? POINTS[c.grade].toFixed(2) : '<span class="text-muted">-</span>'}</td>
          <td><span class="badge ${STATUS_BADGE[c.status]}">${STATUS_LABEL[c.status]}</span></td>
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" data-edit="${c.id}" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-secondary" data-del="${c.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
          </td></tr>`
          )
          .join("")
      : `<tr><td colspan="9" class="empty-hint p-4 text-center">${
          courses.length ? "No courses match these filters." : "No courses yet. Use Add Course to start tracking your GPA."
        }</td></tr>`;
  }

  function renderChart() {
    const pts = Object.entries(summary.semesters).filter(([, v]) => v !== null);
    if (chart) chart.destroy();
    const canvas = $("gpaChart");
    canvas.classList.toggle("d-none", !pts.length);
    $("gpaEmpty").classList.toggle("d-none", pts.length > 0);
    if (!pts.length) { chart = null; return; }
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: pts.map(([label]) => label),
        datasets: [{
          label: "Semester GPA",
          data: pts.map(([, v]) => v),
          borderColor: "#198754", backgroundColor: "rgba(25,135,84,.12)", fill: true, tension: 0.3, pointRadius: 5,
        }],
      },
      options: { scales: { y: { min: 0, max: 4 } }, plugins: { legend: { display: false } } },
    });
  }

  // ---- filters (called from inline handlers in the page)
  window.filterCourses = (status) => {
    statusFilter = status;
    ["all", "completed", "inprogress", "planned"].forEach((k) => {
      const id = { all: "allCoursesBtn", completed: "completedBtn", inprogress: "inProgressBtn", planned: "plannedBtn" }[k];
      $(id).classList.toggle("active", k === status);
    });
    renderTable();
  };
  window.filterByYear = renderTable;
  window.filterBySemester = renderTable;

  window.calculateGPA = async () => {
    await refresh();
    toast(summary.cumulativeGPA === null ? "No graded courses to calculate yet" : `Cumulative GPA: ${gpa(summary.cumulativeGPA)}`);
  };

  window.saveProgram = async () => {
    try {
      await api("/auth/program", { method: "PATCH", body: { program: $("programSelect").value } });
      toast("Program saved");
      renderCurriculum();
    } catch (e) { toast(e.message, "error"); }
  };

  window.exportTranscript = () => {
    if (!courses.length) return toast("Add some courses first", "error");
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["Code,Title,Year,Semester,Credits,Grade,Grade Points,Status"].concat(
      courses.map((c) => [c.code, c.title, c.year ?? "", c.semester ?? "", c.credits, c.grade ?? "", c.grade ? POINTS[c.grade] : "", STATUS_LABEL[c.status]].map(q).join(","))
    );
    lines.push("", `Cumulative GPA,${gpa(summary.cumulativeGPA)}`, `Credits earned,${summary.creditsEarned} of ${summary.requiredCredits}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "transcript.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- add course
  $("addCourseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("courseStatus").value;
    try {
      await api("/gpa/courses", {
        method: "POST",
        body: {
          code: $("customCourseCode").value, title: $("customCourseTitle").value,
          credits: Number($("courseCredits").value), grade: $("courseGrade").value || null, status,
          year: $("courseYear").value || null, semester: $("courseSemester").value || null,
        },
      });
      bootstrap.Modal.getInstance($("addCourseModal")).hide();
      e.target.reset();
      $("courseCredits").value = 3;
      $("coursePrereq").textContent = DEFAULT_HINT;
      toast("Course added");
      await refresh();
    } catch (err) { toast(err.message, "error"); }
  });

  // ---- edit / delete (delegated)
  $("coursesTableBody").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    if (editBtn) {
      const c = courses.find((x) => x.id === Number(editBtn.dataset.edit));
      if (!c) return;
      $("editCourseId").value = c.id;
      $("editCourseCode").value = c.code;
      $("editCourseCredits").value = c.credits;
      $("editCourseTitle").value = c.title;
      $("editCourseGrade").value = c.grade || "";
      $("editCourseStatus").value = c.status;
      $("editCourseYear").value = c.year || "";
      $("editCourseSemester").value = c.semester || "";
      new bootstrap.Modal($("editCourseModal")).show();
    } else if (delBtn) {
      const c = courses.find((x) => x.id === Number(delBtn.dataset.del));
      if (!c || !confirm(`Delete ${c.code} - ${c.title}?`)) return;
      try { await api(`/gpa/courses/${c.id}`, { method: "DELETE" }); toast("Course deleted"); await refresh(); }
      catch (err) { toast(err.message, "error"); }
    }
  });

  $("editCourseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/gpa/courses/${$("editCourseId").value}`, {
        method: "PATCH",
        body: {
          title: $("editCourseTitle").value, credits: Number($("editCourseCredits").value),
          grade: $("editCourseGrade").value || null, status: $("editCourseStatus").value,
          year: $("editCourseYear").value || null, semester: $("editCourseSemester").value || null,
        },
      });
      bootstrap.Modal.getInstance($("editCourseModal")).hide();
      toast("Course updated");
      await refresh();
    } catch (err) { toast(err.message, "error"); }
  });

  // ---- program curriculum (handbook)
  const DEFAULT_HINT = "Pick a subject from your program, or type a custom course below.";
  const ROMAN = { 1: "I", 2: "II" };
  const program = () => catalog?.[$("programSelect").value];
  const have = () => new Map(courses.map((c) => [c.code, c]));

  function stateCell(c) {
    const mine = have().get(c.code);
    if (!mine) return `<button class="btn btn-sm btn-outline-primary py-0" data-plan="${esc(c.code)}">+ Plan</button>`;
    const label = mine.status === "completed" ? `Completed${mine.grade ? " · " + esc(mine.grade) : ""}` : STATUS_LABEL[mine.status];
    return `<span class="badge ${STATUS_BADGE[mine.status]}">${label}</span>`;
  }

  function semTable(list, title) {
    const total = list.reduce((a, c) => a + c.credits, 0);
    return `<h6 class="small text-uppercase text-muted mt-2">${title}</h6>
      <div class="table-responsive"><table class="table table-sm mb-3"><thead class="table-light"><tr><th>Code</th><th>Course</th><th>Cr</th><th>Prerequisite</th><th></th></tr></thead><tbody>
      ${list.map((c) => `<tr><td class="fw-semibold text-nowrap">${esc(c.code)}</td><td>${esc(c.title)}</td><td>${c.credits}</td>
        <td class="small text-muted">${c.prereq.length ? esc(c.prereq.join(", ")) : "-"}</td><td class="text-end">${stateCell(c)}</td></tr>`).join("")}
      </tbody>${total ? `<tfoot><tr><td colspan="2" class="small text-muted">Total for the semester</td><td class="fw-semibold">${total}</td><td colspan="2"></td></tr></tfoot>` : ""}</table></div>`;
  }

  function accItem(id, heading, body) {
    const open = openYears.has(id);
    return `<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button${open ? "" : " collapsed"}" type="button" data-bs-toggle="collapse" data-bs-target="#${id}">${heading}</button></h2>
      <div id="${id}" class="accordion-collapse collapse${open ? " show" : ""}" data-key="${id}"><div class="accordion-body pb-0">${body}</div></div></div>`;
  }

  function renderCurriculum() {
    const p = program();
    if (!p) return;
    $("curriculumName").textContent = p.name;
    let html = "";
    for (const y of [1, 2, 3, 4]) {
      const sems = [1, 2].map((s) => {
        const list = p.courses.filter((c) => c.type !== "elective" && c.year === y && c.semester === s);
        const slots = p.electiveSlots.filter((e) => e.year === y && e.semester === s);
        const note = slots.length ? `<div class="small text-muted mb-2"><i class="bi bi-plus-circle me-1"></i>${slots.map((e) => `${e.slot} (${e.credits} cr)`).join(", ")}: choose from the electives list</div>` : "";
        return `<div class="col-lg-6">${semTable(list, `Semester ${ROMAN[s]}`)}${note}</div>`;
      }).join("");
      const credits = p.courses.filter((c) => c.year === y).reduce((a, c) => a + c.credits, 0) + p.electiveSlots.filter((e) => e.year === y).reduce((a, e) => a + e.credits, 0);
      html += accItem(`cur-y${y}`, `Year ${y} <span class="text-muted ms-2 small">${credits} credit hours</span>`, `<div class="row">${sems}</div>`);
    }
    const electives = p.courses.filter((c) => c.type === "elective");
    html += accItem("cur-el", `Elective courses <span class="text-muted ms-2 small">choose at least ${p.electiveCreditsRequired} credit hours</span>`, semTable(electives, "Available electives"));
    $("curriculumAcc").innerHTML = html;
    fillCourseSelect();
  }

  $("curriculumAcc").addEventListener("shown.bs.collapse", (e) => openYears.add(e.target.dataset.key));
  $("curriculumAcc").addEventListener("hidden.bs.collapse", (e) => openYears.delete(e.target.dataset.key));

  $("curriculumAcc").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-plan]");
    if (!b) return;
    const c = program()?.courses.find((x) => x.code === b.dataset.plan);
    if (!c) return;
    try {
      await api("/gpa/courses", { method: "POST", body: { code: c.code, title: c.title, credits: c.credits, status: "planned", year: c.year, semester: c.semesterLabel } });
      toast(`${c.code} added as Planned`);
      await refresh();
    } catch (err) { toast(err.message, "error"); }
  });

  function fillCourseSelect() {
    const p = program();
    if (!p) return;
    const mine = have();
    const opt = (c) => `<option value="${esc(c.code)}"${mine.has(c.code) ? " disabled" : ""}>${esc(c.code)} - ${esc(c.title)} (${c.credits} cr)${mine.has(c.code) ? " - already added" : ""}</option>`;
    let html = '<option value="">Choose from curriculum...</option>';
    for (const y of [1, 2, 3, 4]) for (const s of [1, 2]) {
      const list = p.courses.filter((c) => c.type !== "elective" && c.year === y && c.semester === s);
      html += `<optgroup label="Year ${y} · Semester ${ROMAN[s]}">${list.map(opt).join("")}</optgroup>`;
    }
    html += `<optgroup label="Electives (min. ${p.electiveCreditsRequired} credit hours)">${p.courses.filter((c) => c.type === "elective").map(opt).join("")}</optgroup>`;
    const cur = $("courseSelect").value;
    $("courseSelect").innerHTML = html;
    $("courseSelect").value = cur;
  }

  window.populateCourseDetails = () => {
    const c = program()?.courses.find((x) => x.code === $("courseSelect").value);
    if (!c) { $("coursePrereq").textContent = DEFAULT_HINT; return; }
    $("customCourseCode").value = c.code;
    $("customCourseTitle").value = c.title;
    $("courseCredits").value = c.credits;
    $("courseYear").value = c.year ?? "";
    $("courseSemester").value = c.semesterLabel ?? "";
    const typeLabel = { compulsory: "Compulsory", support: "Support", elective: "Elective" }[c.type];
    $("coursePrereq").textContent = `${typeLabel} · ${c.credits} credit hours · ${c.prereq.length ? "Prerequisite: " + c.prereq.join(", ") : "No prerequisite"}${c.year ? "" : " · you can take electives in Year 3 or 4"}`;
  };

  window.loadCurriculum = async () => {
    const p = program();
    if (!p) return;
    const n = p.courses.filter((c) => c.type !== "elective").length;
    if (!confirm(`Add all ${n} scheduled ${p.name} courses to your list as Planned?\nCourses you already have are left as they are. Electives are not added.`)) return;
    try {
      const r = await api("/gpa/curriculum/load", { method: "POST", body: { program: $("programSelect").value } });
      toast(`${r.added} courses added, ${r.skipped} already in your list`);
      await refresh();
    } catch (err) { toast(err.message, "error"); }
  };

  // ---- year / semester grid: the courses behind each semester GPA
  function renderYearCourses() {
    for (const y of [1, 2, 3, 4]) {
      const host = $(`year${y}GPA`).closest(".card-body");
      host.closest(".card").classList.add("h-100"); // equal-height year cards
      let box = host.querySelector(".year-courses");
      if (!box) { box = document.createElement("div"); box.className = "year-courses"; host.appendChild(box); }
      box.innerHTML = summary.semestersByYear[y].map((label, i) => {
        const list = courses.filter((c) => c.year === y && c.semester === label);
        if (!list.length) return "";
        const credits = list.reduce((a, c) => a + c.credits, 0);
        const chips = list.map((c) => `<span class="badge ${STATUS_BADGE[c.status]}" title="${esc(c.title)}">${esc(c.code)}${c.grade ? " · " + esc(c.grade) : ""}</span>`).join("");
        return `<div class="mt-2 pt-2 border-top"><div class="small text-muted">Semester ${i + 1} · ${list.length} ${list.length === 1 ? "course" : "courses"} · ${credits} credits</div><div class="d-flex flex-wrap gap-1 mt-1">${chips}</div></div>`;
      }).join("");
    }
  }

  // ---- GPA calculator (what-if, client side only, nothing is saved)
  let calcRows = [{ name: "", credits: 3, grade: "" }];
  const GRADES = Object.keys(POINTS);

  function standing() { // quality points and credits from completed, graded courses (same rule as the server)
    const graded = courses.filter((c) => c.status === "completed" && c.grade && c.grade in POINTS);
    return { credits: graded.reduce((a, c) => a + c.credits, 0), points: graded.reduce((a, c) => a + POINTS[c.grade] * c.credits, 0) };
  }

  function renderCalcRows() {
    $("calcRows").innerHTML = calcRows.map((r, i) => `<tr data-i="${i}">
      <td><input class="form-control form-control-sm" data-f="name" maxlength="60" placeholder="Course (optional)" value="${esc(r.name)}" /></td>
      <td><input class="form-control form-control-sm" data-f="credits" type="number" min="1" max="6" value="${r.credits}" /></td>
      <td><select class="form-select form-select-sm" data-f="grade"><option value="">Grade</option>${GRADES.map((g) => `<option value="${g}"${r.grade === g ? " selected" : ""}>${g} (${POINTS[g].toFixed(2)})</option>`).join("")}</select></td>
      <td><button class="btn btn-sm btn-outline-secondary" data-rm="${i}" title="Remove row" type="button"><i class="bi bi-x-lg"></i></button></td></tr>`).join("")
      || '<tr><td colspan="4" class="empty-hint p-3 text-center">No rows. Press Row to add a course.</td></tr>';
  }

  function recalc() {
    const rows = calcRows.filter((r) => r.grade && Number(r.credits) > 0);
    const c1 = rows.reduce((a, r) => a + Number(r.credits), 0);
    const q1 = rows.reduce((a, r) => a + POINTS[r.grade] * Number(r.credits), 0);
    const now = $("calcInclude").checked ? standing() : { credits: 0, points: 0 };
    const total = now.credits + c1;
    $("calcSemGPA").textContent = c1 ? (q1 / c1).toFixed(2) : "--";
    $("calcCredits").textContent = c1;
    $("calcCumGPA").textContent = total ? ((now.points + q1) / total).toFixed(2) : "--";
    const cur = standing();
    const before = cur.credits ? cur.points / cur.credits : null;
    $("calcCompare").textContent = !c1 ? "Choose a grade for at least one row to see the result."
      : before === null || !$("calcInclude").checked ? ""
      : `Current cumulative ${before.toFixed(2)} → ${((now.points + q1) / total).toFixed(2)} (${(((now.points + q1) / total) - before >= 0 ? "+" : "")}${(((now.points + q1) / total) - before).toFixed(2)})`;
    recalcTarget();
  }

  function recalcTarget() {
    const out = $("calcTargetResult");
    const target = parseFloat($("calcTarget").value);
    const cN = Number($("calcTargetCredits").value);
    if ($("calcTarget").value === "") { out.textContent = "Enter a target to see the average grade you need."; return; }
    if (!(target >= 0 && target <= 4) || !(cN >= 1)) { out.textContent = "Use a target between 0 and 4.00 and at least 1 credit."; return; }
    const cur = standing();
    const need = (target * (cur.credits + cN) - cur.points) / cN;
    const best = (cur.points + 4 * cN) / (cur.credits + cN);
    if (need > 4) out.innerHTML = `<strong>Not reachable in these ${cN} credits.</strong> Straight A's would give ${best.toFixed(2)}. Spread the target over more credits.`;
    else if (need <= 0) out.innerHTML = `<strong>Already safe.</strong> You stay at or above ${target.toFixed(2)} whatever you score in these ${cN} credits.`;
    else {
      const letter = GRADES.filter((g) => POINTS[g] >= need).sort((a, b) => POINTS[a] - POINTS[b])[0];
      out.innerHTML = `<strong>You need an average of ${need.toFixed(2)}</strong> over the next ${cN} credits (about ${letter}).`;
    }
  }

  $("calcRows").addEventListener("input", (e) => {
    const tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    const r = calcRows[Number(tr.dataset.i)];
    r[e.target.dataset.f] = e.target.dataset.f === "credits" ? Number(e.target.value) : e.target.value;
    recalc();
  });
  $("calcRows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    calcRows.splice(Number(b.dataset.rm), 1);
    renderCalcRows(); recalc();
  });
  $("calcAdd").addEventListener("click", () => { calcRows.push({ name: "", credits: 3, grade: "" }); renderCalcRows(); recalc(); });
  $("calcClear").addEventListener("click", () => { calcRows = [{ name: "", credits: 3, grade: "" }]; renderCalcRows(); recalc(); });
  $("calcLoad").addEventListener("click", () => {
    const open = courses.filter((c) => c.status !== "completed");
    if (!open.length) return toast("No in-progress or planned courses to load yet", "error");
    calcRows = open.map((c) => ({ name: `${c.code} ${c.title}`, credits: c.credits, grade: "" }));
    renderCalcRows(); recalc();
  });
  ["calcInclude", "calcTarget", "calcTargetCredits"].forEach((id) => $(id).addEventListener("input", recalc));
  renderCalcRows();

  async function init() {
    catalog = (await api("/gpa/curriculum")).programs;
    await refresh();
  }

  init().catch((e) => toast(e.message, "error"));
})();
