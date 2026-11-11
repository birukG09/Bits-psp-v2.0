// Sticky notes for the PSP page: Windows-style coloured notes that save as you type.
(function () {
  const { api, esc, toast } = Bits;
  const $ = (id) => document.getElementById(id);
  const COLORS = ["yellow", "green", "blue", "pink", "purple", "white"];
  const NEW_NOTE_COLORS = ["yellow", "green", "blue"]; // new notes cycle through these
  const SAVE_DELAY = 600;

  let notes = [], jobs = [];
  const timers = new Map(); // note id -> pending debounce timer

  const when = (s) => {
    const d = new Date(String(s).replace(" ", "T") + "Z"); // server stores UTC
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  function visible() {
    const q = $("noteSearch").value.trim().toLowerCase();
    const f = $("noteJobFilter").value;
    return notes.filter((n) =>
      (!q || n.body.toLowerCase().includes(q) || (n.jobName ?? "").toLowerCase().includes(q)) &&
      (f === "" || (f === "none" ? n.jobId === null : String(n.jobId) === f)));
  }

  function jobOptions(selected) {
    return '<option value="">No linked job</option>' + jobs.map((j) =>
      `<option value="${j.id}"${j.id === selected ? " selected" : ""}>#${j.jobNo} ${esc(j.name)}</option>`).join("");
  }

  function renderFilter() {
    const cur = $("noteJobFilter").value;
    $("noteJobFilter").innerHTML = '<option value="">All notes</option><option value="none">Not linked to a job</option>' +
      jobs.map((j) => `<option value="${j.id}">#${j.jobNo} ${esc(j.name)}</option>`).join("");
    if ([...$("noteJobFilter").options].some((o) => o.value === cur)) $("noteJobFilter").value = cur;
  }

  function cardHtml(n) {
    return `<div class="sticky c-${n.color}" data-id="${n.id}">
      <div class="sticky-bar">
        <button class="btn btn-sm" data-a="pin" title="${n.pinned ? "Unpin" : "Pin to top"}"><i class="bi ${n.pinned ? "bi-pin-angle-fill pin-on" : "bi-pin-angle"}"></i></button>
        <span class="d-flex gap-1 px-1">${COLORS.map((c) => `<button class="swatch c-${c}" data-a="color" data-c="${c}" title="${c}" aria-label="${c}"></button>`).join("")}</span>
        <button class="btn btn-sm ms-auto" data-a="del" title="Delete note"><i class="bi bi-trash"></i></button>
      </div>
      <textarea maxlength="5000" placeholder="Take a note..." aria-label="Note text">${esc(n.body)}</textarea>
      <div class="sticky-foot"><select data-a="job" aria-label="Linked job">${jobOptions(n.jobId)}</select>
        <span class="stamp">${when(n.updatedAt)}</span><span class="saved"><i class="bi bi-check2"></i></span></div></div>`;
  }

  function render() {
    renderFilter();
    const list = visible();
    $("noteBoard").innerHTML = list.map(cardHtml).join("");
    $("noteCount").textContent = notes.length ? `${list.length} of ${notes.length} ${notes.length === 1 ? "note" : "notes"}` : "";
    $("noteEmpty").classList.toggle("d-none", list.length > 0);
    $("noteEmpty").textContent = notes.length
      ? "No notes match your search."
      : "No notes yet. Press New note for a sticky note you can type straight into. Link it to a job to find it again from that job.";
  }

  const cardOf = (id) => $("noteBoard").querySelector(`.sticky[data-id="${id}"]`);

  async function save(id, patch) {
    try {
      const n = await api(`/psp/notes/${id}`, { method: "PATCH", body: patch });
      const i = notes.findIndex((x) => x.id === id);
      if (i >= 0) notes[i] = n;
      const card = cardOf(id);
      if (card) {
        card.querySelector(".stamp").textContent = when(n.updatedAt);
        const s = card.querySelector(".saved");
        s.classList.add("show");
        setTimeout(() => s.classList.remove("show"), 1200);
      }
      return n;
    } catch (err) { toast(err.message, "error"); }
  }

  function flush(id) {
    if (!timers.has(id)) return;
    clearTimeout(timers.get(id));
    timers.delete(id);
    const card = cardOf(id);
    if (card) return save(id, { body: card.querySelector("textarea").value });
  }
  const flushAll = () => [...timers.keys()].forEach(flush);

  async function load() {
    try {
      [notes, jobs] = await Promise.all([api("/psp/notes"), api("/psp/jobs")]);
      render();
    } catch (err) { toast(err.message, "error"); }
  }

  $("newNoteBtn").addEventListener("click", async () => {
    try {
      // a new note picks up the job filter so it lands in the view you are looking at
      const f = $("noteJobFilter").value;
      const n = await api("/psp/notes", {
        method: "POST",
        body: { color: NEW_NOTE_COLORS[notes.length % NEW_NOTE_COLORS.length], jobId: f && f !== "none" ? Number(f) : null },
      });
      notes.unshift(n);
      $("noteSearch").value = "";
      render();
      cardOf(n.id)?.querySelector("textarea").focus();
    } catch (err) { toast(err.message, "error"); }
  });

  $("noteBoard").addEventListener("input", (e) => {
    if (e.target.tagName !== "TEXTAREA") return;
    const id = Number(e.target.closest(".sticky").dataset.id);
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => flush(id), SAVE_DELAY));
  });
  $("noteBoard").addEventListener("focusout", (e) => {
    if (e.target.tagName === "TEXTAREA") flush(Number(e.target.closest(".sticky").dataset.id));
  });

  $("noteBoard").addEventListener("change", async (e) => {
    if (e.target.dataset.a !== "job") return;
    const id = Number(e.target.closest(".sticky").dataset.id);
    const n = await save(id, { jobId: e.target.value === "" ? null : Number(e.target.value) });
    if (n && $("noteJobFilter").value) render(); // the note may no longer match the job filter
  });

  $("noteBoard").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b || b.tagName === "SELECT") return;
    const card = b.closest(".sticky");
    const id = Number(card.dataset.id);
    const note = notes.find((x) => x.id === id);
    if (b.dataset.a === "color") {
      card.className = `sticky c-${b.dataset.c}`;
      save(id, { color: b.dataset.c });
    } else if (b.dataset.a === "pin") {
      await flush(id);
      if (await save(id, { pinned: !note.pinned })) {
        notes.sort((a, z) => Number(z.pinned) - Number(a.pinned) || String(z.updatedAt).localeCompare(String(a.updatedAt)) || z.id - a.id);
        render();
      }
    } else if (b.dataset.a === "del") {
      if (card.querySelector("textarea").value.trim() && !confirm("Delete this note?")) return;
      clearTimeout(timers.get(id)); timers.delete(id);
      try {
        await api(`/psp/notes/${id}`, { method: "DELETE" });
        notes = notes.filter((x) => x.id !== id);
        render();
      } catch (err) { toast(err.message, "error"); }
    }
  });

  $("noteSearch").addEventListener("input", () => { flushAll(); render(); });
  $("noteJobFilter").addEventListener("change", () => { flushAll(); render(); });

  const tabBtn = document.querySelector('[data-bs-target="#paneNotes"]');
  tabBtn.addEventListener("shown.bs.tab", load);
  tabBtn.addEventListener("hide.bs.tab", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushAll(); });
  window.addEventListener("pagehide", flushAll);

  // Deep link: psp-logs.html#notes opens the Notes tab directly
  if (location.hash === "#notes") bootstrap.Tab.getOrCreateInstance(tabBtn).show();
})();
