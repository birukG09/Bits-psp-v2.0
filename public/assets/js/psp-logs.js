(async function () {
  const { api, esc, toast } = Bits;
  const $ = (id) => document.getElementById(id);
  await Bits.requireLogin("student");

  const PHASE_LABEL = { requirements: "Requirements analysis", design: "Design", implementation: "Implementation", testing: "Testing", documentation: "Documentation", other: "Other" };
  const STATUS = { planned: ["Planned", "bg-secondary"], in_progress: ["In progress", "bg-info"], done: ["Done", "bg-success"] };
  const TIMER_KEY = "psp_timer";

  let jobs = [], entries = [], summary = null;
  const charts = {};
  let timerPending = false; // true while the entry modal was opened from "Stop and log"

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (m) => (m === null || m === undefined ? "-" : `${Math.floor(m / 60)}:${pad(m % 60)}`);
  const num = (v) => (v === null || v === undefined ? "-" : String(Math.round(v * 100) / 100));
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toMin = (t) => { const m = /^(\d\d):(\d\d)$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const jobLabel = (j) => `#${j.jobNo} ${j.name} (${j.project})`;
  const modal = (id) => bootstrap.Modal.getOrCreateInstance($(id));

  function download(name, rows) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  }

  const timer = {
    get() { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(TIMER_KEY, JSON.stringify(v)) : localStorage.removeItem(TIMER_KEY); } catch {} },
  };

  /* ---------- data ---------- */
  async function loadEntries() {
    const date = $("dateFilter").value;
    entries = await api(`/psp/entries${date ? `?date=${date}` : ""}`);
    renderEntries();
  }
  async function loadAll() {
    [jobs, summary] = await Promise.all([api("/psp/jobs"), api("/psp/summary")]);
    renderJobs();
    renderJobSelects();
    renderSummary();
    await loadEntries();
    renderTimer();
  }

  /* ---------- Job Number Log ---------- */
  function visibleJobs() {
    const p = $("projectFilter").value, k = $("kindFilter").value;
    return jobs.filter((j) => (!p || j.project === p) && (!k || j.kind === k));
  }

  function renderProjectFilter() {
    const cur = $("projectFilter").value;
    const projects = [...new Set(jobs.map((j) => j.project))].sort();
    $("projectFilter").innerHTML = '<option value="">All projects</option>' + projects.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    if (projects.includes(cur)) $("projectFilter").value = cur;
    $("projectList").innerHTML = projects.map((p) => `<option value="${esc(p)}"></option>`).join("");
  }

  function renderJobs() {
    renderProjectFilter();
    const list = visibleJobs();
    let estSum = 0, actSum = 0;
    const unitSum = {};
    $("jobsBody").innerHTML = list.length
      ? list.map((j) => {
          estSum += j.estMinutes ?? 0;
          actSum += j.actualMinutes;
          unitSum[j.unitLabel] = (unitSum[j.unitLabel] ?? 0) + (j.actualUnits ?? 0);
          const [stLabel, stCls] = STATUS[j.status];
          return `<tr>
            <td class="fw-semibold">${j.jobNo}</td>
            <td><div class="fw-semibold">${esc(j.name)}</div><small class="text-muted">${esc(j.project)} · ${esc(PHASE_LABEL[j.phase])}${j.kind === "previous" ? " · previous work" : ""}</small></td>
            <td><span class="badge ${stCls}">${stLabel}</span></td>
            <td class="border-start">${hm(j.estMinutes)}</td>
            <td>${j.entryCount ? hm(j.actualMinutes) : "-"}</td>
            <td class="border-start">${j.estUnits === null ? "-" : `${num(j.estUnits)} ${esc(j.unitLabel)}`}</td>
            <td>${j.actualUnits === null ? "-" : `${num(j.actualUnits)} ${esc(j.unitLabel)}`}</td>
            <td class="border-start">${hm(estSum)}</td>
            <td>${hm(actSum)}</td>
            <td>${num(unitSum[j.unitLabel])} ${esc(j.unitLabel)}</td>
            <td class="text-nowrap"><div class="btn-group btn-group-sm">
              <button class="btn btn-outline-success" data-act="log" data-id="${j.id}" title="Log time"><i class="bi bi-clock-history"></i></button>
              <button class="btn btn-outline-primary" data-act="edit" data-id="${j.id}" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-secondary" data-act="del" data-id="${j.id}" title="Delete"><i class="bi bi-trash"></i></button></div></td></tr>`;
        }).join("")
      : `<tr><td colspan="11" class="empty-hint p-4 text-center">${jobs.length ? "No jobs match these filters." : "No jobs yet. Use Add job, or Add standard jobs for requirements, design, implementation, testing and documentation."}</td></tr>`;
  }

  function renderJobSelects() {
    const opts = jobs.map((j) => `<option value="${j.id}">${esc(jobLabel(j))}</option>`).join("");
    const none = '<option value="">No jobs yet</option>';
    const prevEntry = $("entryJob").value, prevTimer = $("timerJobSelect").value;
    $("entryJob").innerHTML = opts || none;
    $("timerJobSelect").innerHTML = opts || none;
    if (prevEntry) $("entryJob").value = prevEntry;
    if (prevTimer) $("timerJobSelect").value = prevTimer;
  }

  function openJob(job, defaults = {}) {
    $("jobModalTitle").textContent = job ? `Edit job #${job.jobNo}` : "Add job";
    $("jobId").value = job?.id ?? "";
    $("jobProject").value = job?.project ?? defaults.project ?? "";
    $("jobKind").value = job?.kind ?? defaults.kind ?? "project";
    $("jobPhase").value = job?.phase ?? "other";
    $("jobName").value = job?.name ?? "";
    $("jobEstMin").value = job?.estMinutes ?? "";
    $("jobEstUnits").value = job?.estUnits ?? "";
    $("jobUnitLabel").value = job?.unitLabel ?? "LOC";
    $("jobStatus").value = job?.status ?? "planned";
    $("jobActualUnits").value = job?.actualUnits ?? "";
    $("jobCompleted").value = job?.completedOn ?? "";
    $("jobNotes").value = job?.notes ?? "";
    modal("jobModal").show();
  }

  $("jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      project: $("jobProject").value, kind: $("jobKind").value, phase: $("jobPhase").value, name: $("jobName").value,
      estMinutes: $("jobEstMin").value, estUnits: $("jobEstUnits").value, unitLabel: $("jobUnitLabel").value,
      status: $("jobStatus").value, actualUnits: $("jobActualUnits").value, completedOn: $("jobCompleted").value, notes: $("jobNotes").value,
    };
    const id = $("jobId").value;
    try {
      await api(id ? `/psp/jobs/${id}` : "/psp/jobs", { method: id ? "PATCH" : "POST", body });
      modal("jobModal").hide();
      toast(id ? "Job updated" : "Job added");
      await loadAll();
    } catch (err) { toast(err.message, "error"); }
  });

  $("addJobBtn").addEventListener("click", () => openJob(null, { project: $("projectFilter").value, kind: $("kindFilter").value || "project" }));

  $("templateBtn").addEventListener("click", async () => {
    const project = prompt("Project name for the five standard jobs (requirements analysis, design, implementation, testing, documentation):", $("projectFilter").value || "Student Grade Management System");
    if (!project || !project.trim()) return;
    try {
      await api("/psp/jobs/template", { method: "POST", body: { project: project.trim(), kind: $("kindFilter").value === "previous" ? "previous" : "project" } });
      toast("Standard jobs added. Fill in your estimates before you start each job.");
      $("projectFilter").value = project.trim();
      await loadAll();
    } catch (err) { toast(err.message, "error"); }
  });

  $("jobsBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const job = jobs.find((j) => j.id === Number(b.dataset.id));
    if (!job) return;
    if (b.dataset.act === "edit") openJob(job);
    else if (b.dataset.act === "log") openEntry(null, { jobId: job.id });
    else if (b.dataset.act === "del") {
      const extra = job.entryCount ? ` and its ${job.entryCount} time ${job.entryCount === 1 ? "entry" : "entries"}` : "";
      if (!confirm(`Delete job #${job.jobNo} "${job.name}"${extra}?`)) return;
      try { await api(`/psp/jobs/${job.id}`, { method: "DELETE" }); toast("Job deleted"); await loadAll(); } catch (err) { toast(err.message, "error"); }
    }
  });

  $("projectFilter").addEventListener("change", renderJobs);
  $("kindFilter").addEventListener("change", renderJobs);

  $("exportJobs").addEventListener("click", () => {
    const list = visibleJobs();
    if (!list.length) return toast("Nothing to export yet", "error");
    let est = 0, act = 0; const units = {};
    const rows = [["Job #", "Project", "Kind", "Phase", "Job", "Status", "Est. time (min)", "Actual time (min)", "Est. units", "Actual units", "Unit", "To Date est. (min)", "To Date actual (min)", "To Date units", "Completed on", "Notes"]];
    for (const j of list) {
      est += j.estMinutes ?? 0; act += j.actualMinutes; units[j.unitLabel] = (units[j.unitLabel] ?? 0) + (j.actualUnits ?? 0);
      rows.push([j.jobNo, j.project, j.kind, j.phase, j.name, j.status, j.estMinutes ?? "", j.actualMinutes, j.estUnits ?? "", j.actualUnits ?? "", j.unitLabel, est, act, units[j.unitLabel], j.completedOn ?? "", j.notes ?? ""]);
    }
    download("job-number-log.csv", rows);
  });

  /* ---------- Daily Time Log ---------- */
  function renderEntries() {
    const total = entries.reduce((a, e) => a + e.deltaMin, 0);
    $("entryTotal").textContent = entries.length ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"} · ${hm(total)} total` : "";
    $("entriesBody").innerHTML = entries.length
      ? entries.map((e) => `<tr>
          <td class="text-nowrap">${esc(e.date)}</td><td>${esc(e.start)}</td><td>${esc(e.stop)}</td>
          <td>${e.interruptionMin ? `${e.interruptionMin} min${e.interruptionNote ? ` <small class="text-muted">(${esc(e.interruptionNote)})</small>` : ""}` : "-"}</td>
          <td class="fw-semibold">${hm(e.deltaMin)}</td>
          <td><span class="badge bg-primary me-1">#${e.jobNo}</span>${esc(e.jobName)}<br><small class="text-muted">${esc(e.project)}</small></td>
          <td><small>${esc(e.comments ?? "")}</small></td>
          <td class="text-nowrap"><div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-eact="edit" data-id="${e.id}" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-secondary" data-eact="del" data-id="${e.id}" title="Delete"><i class="bi bi-trash"></i></button></div></td></tr>`).join("")
      : `<tr><td colspan="8" class="empty-hint p-4 text-center">${$("dateFilter").value ? "No time logged on this date." : jobs.length ? "No time logged yet. Use Log time or the timer." : "Add a job first, then log your time against it."}</td></tr>`;
  }

  function updateDelta() {
    const s = toMin($("entryStart").value), t = toMin($("entryStop").value), i = Number($("entryInt").value || 0);
    const el = $("deltaPreview");
    if (s === null || t === null) { el.textContent = "Delta time: --"; return; }
    if (t <= s) { el.textContent = "Stop must be after start."; return; }
    if (i > t - s) { el.textContent = "Interruption is longer than the time between start and stop."; return; }
    el.textContent = `Delta time: ${hm(t - s - i)} (${t - s - i} min)`;
  }
  ["entryStart", "entryStop", "entryInt"].forEach((id) => $(id).addEventListener("input", updateDelta));

  function openEntry(entry, defaults = {}) {
    if (!jobs.length) return toast("Add a job first, then log your time against it.", "error");
    $("entryModalTitle").textContent = entry ? "Edit time entry" : "Log time";
    $("entryId").value = entry?.id ?? "";
    $("entryDate").value = entry?.date ?? defaults.date ?? ($("dateFilter").value || todayStr());
    $("entryJob").value = String(entry?.jobId ?? defaults.jobId ?? $("entryJob").value ?? "");
    $("entryStart").value = entry?.start ?? defaults.start ?? "";
    $("entryStop").value = entry?.stop ?? defaults.stop ?? "";
    $("entryInt").value = entry?.interruptionMin ?? 0;
    $("entryIntNote").value = entry?.interruptionNote ?? "";
    $("entryComments").value = entry?.comments ?? "";
    updateDelta();
    modal("entryModal").show();
  }

  $("entryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      jobId: Number($("entryJob").value), date: $("entryDate").value, start: $("entryStart").value, stop: $("entryStop").value,
      interruptionMin: $("entryInt").value, interruptionNote: $("entryIntNote").value, comments: $("entryComments").value,
    };
    const id = $("entryId").value;
    try {
      await api(id ? `/psp/entries/${id}` : "/psp/entries", { method: id ? "PATCH" : "POST", body });
      if (timerPending) timer.set(null); // the running timer is only cleared once its time is saved
      timerPending = false;
      modal("entryModal").hide();
      toast("Time entry saved");
      await loadAll();
    } catch (err) { toast(err.message, "error"); }
  });
  $("entryModal").addEventListener("hidden.bs.modal", () => { timerPending = false; });

  $("addEntryBtn").addEventListener("click", () => openEntry(null));

  $("entriesBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-eact]");
    if (!b) return;
    const entry = entries.find((x) => x.id === Number(b.dataset.id));
    if (!entry) return;
    if (b.dataset.eact === "edit") openEntry(entry);
    else if (confirm(`Delete the ${entry.start}-${entry.stop} entry on ${entry.date}?`)) {
      try { await api(`/psp/entries/${entry.id}`, { method: "DELETE" }); toast("Entry deleted"); await loadAll(); } catch (err) { toast(err.message, "error"); }
    }
  });

  $("dateFilter").addEventListener("change", loadEntries);
  $("clearDate").addEventListener("click", () => { $("dateFilter").value = ""; loadEntries(); });

  $("exportEntries").addEventListener("click", async () => {
    try {
      const all = await api("/psp/entries");
      if (!all.length) return toast("Nothing to export yet", "error");
      download("daily-time-log.csv", [["Date", "Start", "Stop", "Interruption (min)", "Interruption reason", "Delta (min)", "Job #", "Job", "Project", "Comments"]]
        .concat(all.map((x) => [x.date, x.start, x.stop, x.interruptionMin, x.interruptionNote ?? "", x.deltaMin, x.jobNo, x.jobName, x.project, x.comments ?? ""])));
    } catch (err) { toast(err.message, "error"); }
  });

  /* ---------- timer ---------- */
  function renderTimer() {
    const t = timer.get();
    const job = t && jobs.find((j) => j.id === t.jobId);
    if (t && !job) timer.set(null);
    const show = !!(t && job);
    $("timerBanner").classList.toggle("d-none", !show);
    $("timerBanner").classList.toggle("d-flex", show);
    if (!show) return;
    const started = new Date(t.start);
    $("timerJob").textContent = jobLabel(job);
    $("timerSince").textContent = `${pad(started.getHours())}:${pad(started.getMinutes())}`;
    const mins = Math.max(0, Math.floor((Date.now() - started.getTime()) / 60000));
    $("timerElapsed").textContent = `${hm(mins)} elapsed`;
  }
  setInterval(renderTimer, 20000);

  $("timerStart").addEventListener("click", () => {
    if (timer.get()) return toast("A timer is already running", "error");
    const jobId = Number($("timerJobSelect").value);
    if (!jobId) return toast("Add a job first, then start a timer for it.", "error");
    timer.set({ jobId, start: new Date().toISOString() });
    renderTimer();
    toast("Timer started");
  });

  $("timerStop").addEventListener("click", () => {
    const t = timer.get();
    if (!t) return;
    const started = new Date(t.start);
    const sameDay = started.toDateString() === new Date().toDateString();
    const start = sameDay ? `${pad(started.getHours())}:${pad(started.getMinutes())}` : "00:00";
    const stop = nowHM();
    if (toMin(stop) <= toMin(start)) return toast("That is less than a minute. Keep timing, or discard the timer.", "error");
    if (!sameDay) toast("The timer started on an earlier day, so today's entry starts at 00:00. Log the earlier part separately.", "error");
    openEntry(null, { jobId: t.jobId, date: todayStr(), start, stop });
    timerPending = true; // set after openEntry so a stale hidden-handler can't clear it
  });

  $("timerCancel").addEventListener("click", () => {
    if (confirm("Discard the running timer without logging the time?")) { timer.set(null); renderTimer(); }
  });

  /* ---------- Summary ---------- */
  function drawChart(key, canvasId, emptyId, hasData, config) {
    $(emptyId).classList.toggle("d-none", hasData);
    $(canvasId).parentElement.classList.toggle("d-none", !hasData);
    charts[key]?.destroy();
    charts[key] = null;
    if (hasData) charts[key] = new Chart($(canvasId), { ...config, options: { maintainAspectRatio: false, ...config.options } });
  }

  function renderSummary() {
    if (!summary) return;
    const s = summary;
    const tile = (v, l) => `<div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body"><div class="value">${v}</div><div class="label">${l}</div></div></div></div>`;
    const prod = s.productivity.length ? s.productivity.map((p) => `${p.unitsPerHour} ${esc(p.unitLabel)}/h`).join(" · ") : "--";
    $("kpis").innerHTML =
      tile(hm(s.totals.actualMinutes), "Total time logged (h:mm)") +
      tile(`${s.totals.done}/${s.totals.jobs}`, "Jobs completed") +
      tile(s.avgAbsError === null ? "--" : `${s.avgAbsError}%`, "Average estimate error") +
      tile(prod, "Productivity (completed jobs)");

    $("phaseBody").innerHTML = s.perPhase.length
      ? s.perPhase.map((p) => `<tr><td>${esc(PHASE_LABEL[p.phase])}</td><td>${p.jobs}</td><td>${p.estMinutes ? hm(p.estMinutes) : "-"}</td><td>${hm(p.actualMinutes)}</td></tr>`).join("")
      : '<tr><td colspan="4" class="empty-hint p-3">No jobs yet.</td></tr>';
    $("accBody").innerHTML = s.accuracy.length
      ? s.accuracy.map((a) => `<tr><td>#${a.jobNo} ${esc(a.name)}</td><td>${hm(a.estMinutes)}</td><td>${hm(a.actualMinutes)}</td>
          <td class="${a.errorPercent > 0 ? "text-danger" : "text-success"}">${a.errorPercent > 0 ? "+" : ""}${a.errorPercent}%</td></tr>`).join("")
      : '<tr><td colspan="4" class="empty-hint p-3">Complete a job that has an estimate and logged time to see accuracy.</td></tr>';

    // charts only draw when the Summary tab is visible, otherwise they measure a hidden box
    if (!$("paneSummary").classList.contains("active")) return;
    const compare = jobs.filter((j) => j.estMinutes || j.actualMinutes);
    drawChart("est", "estChart", "estEmpty", compare.length > 0, {
      type: "bar",
      data: { labels: compare.map((j) => `#${j.jobNo} ${j.name.length > 18 ? j.name.slice(0, 17) + "…" : j.name}`),
        datasets: [
          { label: "Estimated", data: compare.map((j) => j.estMinutes), backgroundColor: "#9bd4b4" },
          { label: "Actual", data: compare.map((j) => j.actualMinutes), backgroundColor: "#198754" },
        ] },
      options: { scales: { y: { beginAtZero: true } } },
    });
    drawChart("day", "dayChart", "dayEmpty", s.daily.some((d) => d.minutes > 0), {
      type: "bar",
      data: { labels: s.daily.map((d) => d.date.slice(5)), datasets: [{ label: "Minutes", data: s.daily.map((d) => d.minutes), backgroundColor: "#198754" }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }
  document.querySelector('[data-bs-target="#paneSummary"]').addEventListener("shown.bs.tab", renderSummary);

  loadAll().catch((e) => toast(e.message, "error"));
})();
