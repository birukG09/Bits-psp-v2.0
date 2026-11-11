/* Shared client helpers: auth, fetch wrapper, toasts, escaping. */
(function () {
  const TOKEN_KEY = "bits_token";
  const USER_KEY = "bits_user";

  const store = {
    get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
    get user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } },
    set(token, user) {
      try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
    },
    clear() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {} },
  };

  async function api(path, { method = "GET", body, raw, headers = {} } = {}) {
    const opts = { method, headers: { ...headers } };
    if (store.token) opts.headers.authorization = `Bearer ${store.token}`;
    if (raw !== undefined) opts.body = raw;
    else if (body !== undefined) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/register")) {
      store.clear();
      location.href = "login.html?expired=1";
      throw new Error("Session expired");
    }
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.blob();
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(message, kind = "success") {
    let box = document.getElementById("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.className = "toast-container position-fixed top-0 end-0 p-3";
      box.style.zIndex = 2000;
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${kind === "error" ? "danger" : "success"} border-0`;
    el.setAttribute("role", "alert");
    el.innerHTML = `<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    el.querySelector(".toast-body").textContent = message;
    box.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: kind === "error" ? 6000 : 3000 });
    t.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  }

  // Require a signed-in user with the right role. Resolves with the user, or redirects.
  async function requireLogin(role) {
    if (!store.token) { location.href = "login.html"; return new Promise(() => {}); }
    try {
      const { user } = await api("/auth/me");
      store.set(store.token, user);
      if (role && user.role !== role) {
        location.href = "login.html";
        return new Promise(() => {});
      }
      document.querySelectorAll("#userName").forEach((n) => (n.textContent = user.name));
      return user;
    } catch (e) {
      store.clear();
      location.href = "login.html";
      return new Promise(() => {});
    }
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    store.clear();
    location.href = "index.html";
  }

  const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) =>
    iso ? new Date(iso).toLocaleDateString("en-US", opts) : "";
  const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  function timeAgo(iso) {
    // SQLite datetime('now') values have no timezone; treat them as UTC
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  window.Bits = { api, store, esc, toast, requireLogin, logout, fmtDate, fmtDateTime, timeAgo };
  window.logout = logout; // the pages call logout() from inline onclick
})();
