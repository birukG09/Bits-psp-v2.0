/* Circular 90-day habit tracker.
   One concentric ring per habit, 90 arc segments per ring, polar -> cartesian arc paths
   (see github.com/birukG09/ArcHabit). */
(async function () {
  const { api, esc, toast, fmtDate } = Bits;
  const $ = (id) => document.getElementById(id);

  const TOTAL_DAYS = 90;
  const SVG_SIZE = 760;
  const CENTER = SVG_SIZE / 2;
  const INNER_RADIUS = 90;
  const MAX_OUTER = 338;           // keeps the day labels inside the viewBox even with 10 habits
  const SEGMENT_GAP_DEG = 0.9;
  const DEG_PER_DAY = 360 / TOTAL_DAYS;
  const MAX_HABITS = 10;
  const PALETTE = ["#198754", "#0f766e", "#65a30d", "#0891b2", "#d97706", "#7c3aed", "#db2777", "#2563eb", "#b45309", "#4d7c0f"];
  const SVGNS = "http://www.w3.org/2000/svg";

  await Bits.requireLogin("student");

  let state = { startDate: null, todayDay: null, habits: [] };

  const polar = (r, deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
  };
  const f = (n) => n.toFixed(2);
  function arcPath(innerR, outerR, a1, a2) {
    const p1 = polar(outerR, a1), p2 = polar(outerR, a2), p3 = polar(innerR, a2), p4 = polar(innerR, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${f(p1.x)} ${f(p1.y)} A${f(outerR)} ${f(outerR)} 0 ${large} 1 ${f(p2.x)} ${f(p2.y)} L${f(p3.x)} ${f(p3.y)} A${f(innerR)} ${f(innerR)} 0 ${large} 0 ${f(p4.x)} ${f(p4.y)}Z`;
  }
  function el(name, attrs = {}, text) {
    const n = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------------- ring ---------------- */
  function renderRing() {
    const svg = $("ringSvg");
    svg.innerHTML = "";
    const habits = state.habits;
    $("ringEmpty").classList.toggle("d-none", habits.length > 0);
    svg.classList.toggle("d-none", habits.length === 0);
    if (!habits.length) return;

    const step = Math.min(56, (MAX_OUTER - INNER_RADIUS) / habits.length);
    const ringW = step * 0.79;
    const outermost = INNER_RADIUS + (habits.length - 1) * step + ringW;
    const today = state.todayDay;

    // week lines every 7 days
    for (let d = 7; d <= TOTAL_DAYS; d += 7) {
      const a = d * DEG_PER_DAY, p1 = polar(INNER_RADIUS - 3, a), p2 = polar(outermost + 3, a);
      svg.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "#b8cfc1", "stroke-width": 0.5 }));
    }

    // highlight band for today
    if (today) {
      svg.appendChild(el("path", { d: arcPath(INNER_RADIUS - 6, outermost + 6, (today - 1) * DEG_PER_DAY, today * DEG_PER_DAY), fill: "rgba(25,135,84,.10)", "pointer-events": "none" }));
    }

    // segments
    habits.forEach((h, i) => {
      const innerR = INNER_RADIUS + i * step, outerR = innerR + ringW;
      const done = new Set(h.completedDays);
      for (let day = 1; day <= TOTAL_DAYS; day++) {
        const isDone = done.has(day);
        const isToday = today === day;
        const isPast = today !== null && day < today;
        const cls = isDone ? "ring-seg" : "ring-seg " + (isPast ? "missed" : "empty");
        const seg = el("path", {
          d: arcPath(innerR, outerR, (day - 1) * DEG_PER_DAY + SEGMENT_GAP_DEG / 2, day * DEG_PER_DAY - SEGMENT_GAP_DEG / 2),
          class: cls,
          "data-habit": h.id, "data-day": day,
        });
        if (isDone) seg.setAttribute("fill", h.color);
        else if (isToday) { seg.setAttribute("stroke", h.color); seg.setAttribute("stroke-width", 1); }
        seg.addEventListener("click", () => toggle(h.id, day));
        seg.addEventListener("mouseenter", (e) => showTip(e, h, day, isDone, innerR + ringW / 2));
        seg.addEventListener("mouseleave", hideTip);
        svg.appendChild(seg);
      }
    });

    // today needle
    if (today) {
      const a = (today - 0.5) * DEG_PER_DAY, p1 = polar(INNER_RADIUS - 8, a), p2 = polar(outermost + 10, a), tip = polar(outermost + 24, a);
      svg.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "#0f5132", "stroke-width": 1.5, "stroke-dasharray": "3 2", "pointer-events": "none" }));
      svg.appendChild(el("text", { x: tip.x, y: tip.y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 8, "font-weight": 700, fill: "#0f5132", "pointer-events": "none" }, "TODAY"));
    }

    // habit initials on the 93 degree line, like ArcHabit
    habits.forEach((h, i) => {
      const p = polar(INNER_RADIUS + i * step + ringW / 2, 93);
      const label = h.name.length > 4 ? h.name.slice(0, 3) + "…" : h.name;
      svg.appendChild(el("text", { x: p.x, y: p.y, "dominant-baseline": "middle", "font-size": 7, "font-weight": 600, fill: h.color, "pointer-events": "none", style: "paint-order:stroke;stroke:#fff;stroke-width:3px" }, label));
    });

    // day ticks every 10 days
    for (let day = 10; day <= TOTAL_DAYS; day += 10) {
      const t1 = polar(outermost + 4, day * DEG_PER_DAY), t2 = polar(outermost + 10, day * DEG_PER_DAY), lp = polar(outermost + 24, (day - 5) * DEG_PER_DAY);
      svg.appendChild(el("line", { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, stroke: "#5b7266", "stroke-width": 1.2 }));
      svg.appendChild(el("text", { x: lp.x, y: lp.y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 9, "font-family": "monospace", fill: "#5b7266" }, String(day)));
    }
    const one = polar(outermost + 24, -4);
    svg.appendChild(el("text", { x: one.x, y: one.y, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 9, "font-family": "monospace", fill: "#5b7266" }, "1"));

    // centre
    const overall = Math.round(habits.reduce((a, h) => a + h.completionPercent, 0) / habits.length);
    svg.appendChild(el("circle", { cx: CENTER, cy: CENTER, r: INNER_RADIUS - 6, fill: "#fff", stroke: "#d6e8dd" }));
    svg.appendChild(el("text", { x: CENTER, y: CENTER - 8, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 24, "font-weight": 300, fill: "#1d2b24" }, `${overall}%`));
    svg.appendChild(el("text", { x: CENTER, y: CENTER + 12, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 7, fill: "#5b7266", "letter-spacing": "1.2" }, "OF 90 DAYS"));
  }

  function showTip(e, h, day, isDone, midR) {
    const tip = $("ringTip");
    const svg = $("ringSvg");
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / SVG_SIZE;
    const mid = polar(midR, (day - 0.5) * DEG_PER_DAY);
    tip.innerHTML = `<strong>${esc(h.name)}</strong><br><span class="text-muted">Day ${day} · ${isDone ? "✓ done" : "not done"}</span>`;
    tip.style.left = `${mid.x * scale}px`;
    tip.style.top = `${mid.y * scale + (svg.getBoundingClientRect().top - $("ringWrap").getBoundingClientRect().top)}px`;
    tip.classList.remove("d-none");
  }
  const hideTip = () => $("ringTip").classList.add("d-none");

  /* ---------------- side panels ---------------- */
  function renderStreaks() {
    const bar = $("streakBar");
    if (!state.habits.length) { bar.innerHTML = ""; return; }
    const avg = Math.round(state.habits.reduce((a, h) => a + h.completionPercent, 0) / state.habits.length);
    const best = Math.max(...state.habits.map((h) => h.bestStreak));
    const cur = Math.max(...state.habits.map((h) => h.currentStreak));
    bar.innerHTML = `
      <div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body">
        <div class="value"><i class="bi bi-fire streak-flame"></i> ${cur}</div><div class="label">Current streak (days)</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body">
        <div class="value">${best}</div><div class="label">Best streak (days)</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body">
        <div class="value">${avg}%</div><div class="label">Average completion</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body">
        <div class="value">${state.habits.length}<span class="fs-6 text-muted">/${MAX_HABITS}</span></div><div class="label">Habits</div></div></div></div>`;
  }

  function renderList() {
    const list = $("habitList");
    list.innerHTML = state.habits.length
      ? state.habits
          .map(
            (h) => `<div class="list-group-item">
          <div class="d-flex justify-content-between align-items-center">
            <div class="fw-semibold"><span class="habit-chip" style="background:${esc(h.color)}"></span>${esc(h.name)}</div>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" data-edit="${h.id}" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-secondary" data-del="${h.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
          </div>
          <div class="progress my-2" style="height:6px"><div class="progress-bar" style="width:${h.completionPercent}%;background:${esc(h.color)}"></div></div>
          <small class="text-muted"><i class="bi bi-fire streak-flame"></i> ${h.currentStreak} day streak · best ${h.bestStreak} · ${h.totalCompleted}/90 done (${h.completionPercent}%)</small>
        </div>`
          )
          .join("")
      : `<div class="list-group-item empty-hint">No habits yet.</div>`;
    $("habitLimitNote").textContent =
      state.habits.length >= MAX_HABITS ? "You have reached the 10 habit limit." : "Up to 10 habits, tracked for 90 days.";
    $("habitColor").value = PALETTE.find((c) => !state.habits.some((h) => h.color === c)) || PALETTE[0];
  }

  function renderJourney() {
    const line = $("journeyLine");
    if (state.startDate) {
      const over = state.todayDay === TOTAL_DAYS && Math.floor((Date.now() - new Date(`${state.startDate}T00:00:00`)) / 86400000) + 1 > TOTAL_DAYS;
      line.innerHTML = `<i class="bi bi-calendar-event"></i><span>${over ? "Your 90 days are complete" : `Day ${state.todayDay ?? "-"} of 90`} · started ${esc(fmtDate(state.startDate + "T12:00:00"))}
        <button class="btn btn-link btn-sm p-0 ms-2" id="resetStart">reset to today</button></span>`;
      $("resetStart").addEventListener("click", () => {
        if (confirm("Reset Day 1 to today? Your ticked days are kept.")) startJourney();
      });
    } else {
      line.innerHTML = `<i class="bi bi-calendar-event"></i><button class="btn btn-link p-0 fw-semibold" id="startNow">Start the 90 days today →</button>`;
      $("startNow").addEventListener("click", startJourney);
    }
  }

  function renderAll() { renderJourney(); renderStreaks(); renderList(); renderRing(); }

  /* ---------------- actions ---------------- */
  async function load() { state = await api("/habits"); renderAll(); }

  async function startJourney() {
    try { state = await api("/habits/settings/start", { method: "PUT", body: {} }); renderAll(); toast("90 days started"); }
    catch (e) { toast(e.message, "error"); }
  }

  async function toggle(habitId, day) {
    try {
      await api(`/habits/${habitId}/toggle`, { method: "POST", body: { day } });
      await load(); // server recomputes streaks and percentages
    } catch (e) { toast(e.message, "error"); }
  }

  $("addHabitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/habits", { method: "POST", body: { name: $("habitName").value, color: $("habitColor").value } });
      $("habitName").value = "";
      await load();
    } catch (err) { toast(err.message, "error"); }
  });

  $("habitList").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (edit) {
      const h = state.habits.find((x) => x.id === Number(edit.dataset.edit));
      $("editHabitId").value = h.id; $("editHabitName").value = h.name; $("editHabitColor").value = h.color;
      new bootstrap.Modal($("editHabitModal")).show();
    } else if (del) {
      const h = state.habits.find((x) => x.id === Number(del.dataset.del));
      if (!confirm(`Delete "${h.name}" and all its 90 days of progress?`)) return;
      try { await api(`/habits/${h.id}`, { method: "DELETE" }); await load(); } catch (err) { toast(err.message, "error"); }
    }
  });

  $("editHabitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/habits/${$("editHabitId").value}`, { method: "PATCH", body: { name: $("editHabitName").value, color: $("editHabitColor").value } });
      bootstrap.Modal.getInstance($("editHabitModal")).hide();
      await load();
    } catch (err) { toast(err.message, "error"); }
  });

  $("exportBtn").addEventListener("click", async () => {
    try {
      const blob = await api("/habits/export/json");
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: "habits-export.json" }).click();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message, "error"); }
  });

  load().catch((e) => toast(e.message, "error"));
})();
