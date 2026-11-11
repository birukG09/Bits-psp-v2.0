(function () {
  const $ = (id) => document.getElementById(id);
  const errBox = $("authError");

  function go(user) {
    location.href = "psp-logs.html";
  }

  // Already signed in? Skip the form.
  if (Bits.store.token && Bits.store.user) go(Bits.store.user);

  function showError(msg) {
    errBox.textContent = msg;
    errBox.classList.toggle("d-none", !msg);
  }

  function setMode(mode) {
    document.querySelectorAll("#authTabs .nav-link").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("loginForm").classList.toggle("d-none", mode !== "login");
    $("registerForm").classList.toggle("d-none", mode !== "register");
    showError("");
  }

  document.querySelectorAll("#authTabs .nav-link").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  if (location.hash === "#register") setMode("register");
  window.addEventListener("hashchange", () => setMode(location.hash === "#register" ? "register" : "login"));
  if (new URLSearchParams(location.search).has("expired")) $("expiredNote").classList.remove("d-none");

  async function submit(form, path, payload) {
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showError("");
    try {
      const { token, user } = await Bits.api(path, { method: "POST", body: payload });
      Bits.store.set(token, user);
      go(user);
    } catch (e) {
      showError(e.message);
      btn.disabled = false;
    }
  }

  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submit(e.target, "/auth/login", { email: $("loginEmail").value, password: $("loginPassword").value });
  });

  $("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submit(e.target, "/auth/register", {
      name: $("regName").value,
      email: $("regEmail").value,
      password: $("regPassword").value,
      studentId: $("regStudentId").value,
    });
  });
})();
