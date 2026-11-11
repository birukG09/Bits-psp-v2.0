(async function () {
  const { api, esc, toast } = Bits;
  const $ = (id) => document.getElementById(id);
  await Bits.requireLogin("student");

  const GREEN = "#198754", LIGHT = "rgba(25,135,84,.15)";
  const charts = {};

  // Draw a chart, or show the empty hint when there is nothing to plot.
  function draw(id, hasData, config) {
    $(id + "Empty").classList.toggle("d-none", hasData);
    $(id + "Chart").parentElement.classList.toggle("d-none", !hasData);
    if (charts[id]) charts[id].destroy();
    if (hasData) charts[id] = new Chart($(id + "Chart"), { ...config, options: { maintainAspectRatio: false, ...config.options } });
  }

  const d = await api("/analytics/student").catch((e) => { toast(e.message, "error"); return null; });
  if (!d) return;

  // Insights
  $("insights").innerHTML = d.insights.length
    ? d.insights.map((t) => `<li class="list-group-item">${esc(t)}</li>`).join("")
    : '<li class="list-group-item empty-hint">Insights appear as you add courses, habit check-ins and PSP time logs.</li>';

  // KPIs
  const avgHabit = d.habits.perHabit.length
    ? Math.round(d.habits.perHabit.reduce((a, h) => a + h.completionPercent, 0) / d.habits.perHabit.length) + "%" : "--";
  const kpi = (v, l) => `<div class="col-6 col-lg-3"><div class="card border-0 shadow-sm stat-tile"><div class="card-body"><div class="value">${v}</div><div class="label">${l}</div></div></div></div>`;
  $("kpis").innerHTML =
    kpi(d.gpa.cumulative === null ? "--" : d.gpa.cumulative.toFixed(2), "Cumulative GPA") +
    kpi(`${d.credits.earned}/${d.credits.required}`, "Credits earned") +
    kpi(avgHabit, "Avg habit completion") +
    kpi(`${Math.floor(d.psp.minutes / 60)}h ${String(d.psp.minutes % 60).padStart(2, "0")}m`, "PSP time logged");

  draw("gpa", d.gpa.trend.length > 0, {
    type: "line",
    data: { labels: d.gpa.trend.map((t) => `${t.name} (${t.label.replace(/^\d(st|nd) Semester /, "")})`),
      datasets: [{ label: "GPA", data: d.gpa.trend.map((t) => t.gpa), borderColor: GREEN, backgroundColor: LIGHT, fill: true, tension: 0.3, pointRadius: 5 }] },
    options: { scales: { y: { min: 0, max: 4 } }, plugins: { legend: { display: false } } },
  });

  const dist = d.gpa.distribution.filter((x) => x.count > 0);
  draw("grade", dist.length > 0, {
    type: "bar",
    data: { labels: dist.map((x) => x.letter), datasets: [{ label: "Courses", data: dist.map((x) => x.count), backgroundColor: GREEN }] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
  });

  draw("habit", d.habits.perHabit.length > 0, {
    type: "bar",
    data: { labels: d.habits.perHabit.map((h) => h.name),
      datasets: [{ label: "% of 90 days", data: d.habits.perHabit.map((h) => h.completionPercent), backgroundColor: d.habits.perHabit.map((h) => h.color) }] },
    options: { indexAxis: "y", scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } },
  });

  const anyWeekly = d.habits.weekly.some((w) => w.completions > 0);
  draw("weekly", anyWeekly, {
    type: "bar",
    data: { labels: d.habits.weekly.map((w) => `W${w.week}`), datasets: [{ label: "Check-ins", data: d.habits.weekly.map((w) => w.completions), backgroundColor: GREEN }] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } },
  });
})();
