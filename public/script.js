(() => {
  "use strict";

  // ---------------- Theme (Daylight / Darkroom) ----------------

  const THEME_KEY = "scanline-theme";
  const root = document.documentElement;
  const themeToggle = document.getElementById("themeToggle");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeToggle.setAttribute("aria-checked", String(theme === "dark"));
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  initTheme();

  // ---------------- API helper ----------------

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* no body */
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  // ---------------- Auth state / UI ----------------

  const authArea = document.getElementById("authArea");
  const authModal = document.getElementById("authModal");
  const authClose = document.getElementById("authClose");
  const signInBtn = document.getElementById("signInBtn");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const loginError = document.getElementById("loginError");
  const signupError = document.getElementById("signupError");
  const logSection = document.getElementById("logSection");

  let currentUser = null;

  function openAuthModal(tab = "login") {
    authModal.classList.remove("hidden");
    authModal.setAttribute("aria-hidden", "false");
    switchAuthTab(tab);
    loginError.textContent = "";
    signupError.textContent = "";
  }

  function closeAuthModal() {
    authModal.classList.add("hidden");
    authModal.setAttribute("aria-hidden", "true");
  }

  function switchAuthTab(tab) {
    document.querySelectorAll(".access-tab").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    loginForm.classList.toggle("hidden", tab !== "login");
    signupForm.classList.toggle("hidden", tab !== "signup");
  }

  document.querySelectorAll(".access-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
  });

  signInBtn.addEventListener("click", () => openAuthModal("login"));
  authClose.addEventListener("click", closeAuthModal);
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) closeAuthModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !authModal.classList.contains("hidden")) closeAuthModal();
  });

  function renderAuthArea() {
    if (!currentUser) {
      authArea.innerHTML = '<button id="signInBtn" class="btn btn-outline" type="button">Sign in</button>';
      document.getElementById("signInBtn").addEventListener("click", () => openAuthModal("login"));
      logSection.classList.add("hidden");
      return;
    }

    const initial = currentUser.username.slice(0, 1).toUpperCase();
    authArea.innerHTML = `
      <button id="userChip" class="user-chip" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="avatar">${initial}</span>
        <span>${escapeHtml(currentUser.username)}</span>
      </button>
      <div id="userMenu" class="user-menu hidden" role="menu">
        <button id="viewHistoryBtn" type="button" role="menuitem">View history</button>
        <button id="logoutBtn" type="button" role="menuitem">Sign out</button>
      </div>
    `;

    const chip = document.getElementById("userChip");
    const menu = document.getElementById("userMenu");
    chip.addEventListener("click", () => {
      const open = menu.classList.toggle("hidden") === false;
      chip.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!authArea.contains(e.target)) menu.classList.add("hidden");
    });

    document.getElementById("viewHistoryBtn").addEventListener("click", () => {
      menu.classList.add("hidden");
      logSection.classList.remove("hidden");
      logSection.scrollIntoView({ behavior: "smooth", block: "start" });
      loadHistory();
    });

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      menu.classList.add("hidden");
      await api("/api/auth/logout", { method: "POST" });
      currentUser = null;
      renderAuthArea();
    });

    logSection.classList.remove("hidden");
    loadHistory();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const fd = new FormData(loginForm);
    try {
      const { user } = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: fd.get("identifier"), password: fd.get("password") }),
      });
      currentUser = user;
      closeAuthModal();
      renderAuthArea();
      loginForm.reset();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    signupError.textContent = "";
    const fd = new FormData(signupForm);
    try {
      const { user } = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          username: fd.get("username"),
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      currentUser = user;
      closeAuthModal();
      renderAuthArea();
      signupForm.reset();
    } catch (err) {
      signupError.textContent = err.message;
    }
  });

  async function initAuth() {
    try {
      const { user } = await api("/api/auth/me");
      currentUser = user;
    } catch (_) {
      currentUser = null;
    }
    renderAuthArea();
  }

  // ---------------- Upload / analyze ----------------

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const uploadStatus = document.getElementById("uploadStatus");
  const reportSection = document.getElementById("reportSection");
  const extractedText = document.getElementById("extractedText");
  const extractMeta = document.getElementById("extractMeta");
  const scoreNumber = document.getElementById("scoreNumber");
  const dialFill = document.getElementById("dialFill");
  const statList = document.getElementById("statList");
  const suggestionList = document.getElementById("suggestionList");
  const historyNote = document.getElementById("historyNote");

  const DIAL_CIRCUMFERENCE = 327;

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-active");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  function setStatus(msg, isError = false) {
    uploadStatus.textContent = msg;
    uploadStatus.classList.toggle("error", isError);
  }

  async function handleFile(file) {
    setStatus(`Scanning ${file.name}…`);
    reportSection.classList.add("hidden");

    const fd = new FormData();
    fd.append("file", file);

    try {
      const data = await api("/api/analyze", { method: "POST", body: fd });
      renderReport(data);
      setStatus(`Done — ${file.name}`);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      fileInput.value = "";
    }
  }

  function highlightText(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/#\w+/g, (m) => `<mark>${m}</mark>`)
      .replace(/\b(comment|share|follow|subscribe|click|link in bio|dm|tag|save this|swipe)\b/gi, (m) => `<mark>${m}</mark>`);
  }

  function renderReport(data) {
    const { extraction, analysis, savedToHistory, mimetype, filename } = data;

    extractedText.innerHTML = extraction.text
      ? highlightText(extraction.text)
      : "<em>No text was extracted from this file.</em>";
    extractMeta.textContent = `${extraction.method}${extraction.pages ? ` · ${extraction.pages}p` : ""}`;

    scoreNumber.textContent = analysis.score;
    const offset = DIAL_CIRCUMFERENCE - (DIAL_CIRCUMFERENCE * analysis.score) / 100;
    dialFill.style.strokeDashoffset = String(offset);
    dialFill.style.stroke =
      analysis.score >= 70 ? "var(--good)" : analysis.score >= 40 ? "var(--warn)" : "var(--danger)";

    const s = analysis.stats;
    statList.innerHTML = [
      ["Words", s.wordCount],
      ["Hashtags", s.hashtagCount],
      ["Mentions", s.mentionCount],
      ["Links", s.linkCount],
      ["Emojis", s.emojiCount],
      ["Avg sentence", s.avgSentenceLength],
      ["Questions", s.questionCount],
      ["Has CTA", s.hasCTA ? "yes" : "no"],
    ]
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
      .join("");

    suggestionList.innerHTML = analysis.suggestions
      .map(
        (s) => `
        <li class="note-item type-${s.type}">
          <span class="note-dot"></span>
          <div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.detail)}</p></div>
        </li>`
      )
      .join("") || '<li class="note-item"><p>No notes — nothing stood out.</p></li>';

    if (currentUser) {
      historyNote.textContent = savedToHistory ? "Saved to your log." : "";
      if (savedToHistory) loadHistory();
    } else {
      historyNote.innerHTML = '<a id="signInFromReport">Sign in</a> to keep a log of every scan.';
      const link = document.getElementById("signInFromReport");
      if (link) link.addEventListener("click", () => openAuthModal("login"));
    }

    reportSection.classList.remove("hidden");
    reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------- History log ----------------

  const logList = document.getElementById("logList");
  const logEmpty = document.getElementById("logEmpty");

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  async function loadHistory() {
    if (!currentUser) return;
    try {
      const { history } = await api("/api/history");
      renderHistory(history);
    } catch (_) {
      logList.innerHTML = "";
      logEmpty.textContent = "Couldn't load your history right now.";
      logEmpty.classList.remove("hidden");
    }
  }

  function renderHistory(entries) {
    if (!entries.length) {
      logList.innerHTML = "";
      logEmpty.textContent = "No scans logged yet — run one above and it'll show up here.";
      logEmpty.classList.remove("hidden");
      return;
    }
    logEmpty.classList.add("hidden");
    logList.innerHTML = entries
      .map(
        (h) => `
        <div class="log-card" data-id="${h.id}">
          <span class="log-score">${h.score}</span>
          <div class="log-main">
            <p class="log-filename">${escapeHtml(h.filename)}</p>
            <p class="log-preview">${escapeHtml(h.textPreview || "").slice(0, 90)}</p>
          </div>
          <span class="log-date">${formatDate(h.createdAt)}</span>
          <button class="log-delete" type="button" data-id="${h.id}">Delete</button>
        </div>`
      )
      .join("");

    logList.querySelectorAll(".log-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/history/${btn.dataset.id}`, { method: "DELETE" });
          loadHistory();
        } catch (err) {
          setStatus(err.message, true);
        }
      });
    });
  }

  // ---------------- Init ----------------

  initAuth();
})();
