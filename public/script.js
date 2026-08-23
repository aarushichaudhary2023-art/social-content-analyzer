(() => {
  const dropzone = document.getElementById("dropzone");
  const scanbedInner = document.getElementById("scanbedInner");
  const fileInput = document.getElementById("fileInput");
  const scanSweep = document.getElementById("scanSweep");
  const filenameRow = document.getElementById("filenameRow");

  const statusPanel = document.getElementById("statusPanel");
  const statusText = document.getElementById("statusText");

  const report = document.getElementById("report");
  const scoreNumber = document.getElementById("scoreNumber");
  const statsGrid = document.getElementById("statsGrid");
  const extractionMethod = document.getElementById("extractionMethod");
  const readoutText = document.getElementById("readoutText");
  const notesList = document.getElementById("notesList");
  const resetBtn = document.getElementById("resetBtn");

  const errorPanel = document.getElementById("errorPanel");
  const errorText = document.getElementById("errorText");
  const errorResetBtn = document.getElementById("errorResetBtn");

  const STAT_LABELS = {
    wordCount: "words",
    charCount: "characters",
    hashtagCount: "hashtags",
    mentionCount: "mentions",
    linkCount: "links",
    emojiCount: "emojis",
    questionCount: "questions",
    avgSentenceLength: "avg sentence",
  };

  function resetUI() {
    report.hidden = true;
    errorPanel.hidden = true;
    statusPanel.hidden = true;
    filenameRow.hidden = true;
    scanSweep.hidden = true;
    fileInput.value = "";
  }

  resetBtn.addEventListener("click", resetUI);
  errorResetBtn.addEventListener("click", resetUI);

  scanbedInner.addEventListener("click", () => fileInput.click());

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleFile(file);
  });

  function setStatus(text) {
    statusPanel.hidden = false;
    statusText.textContent = text;
  }

  async function handleFile(file) {
    report.hidden = true;
    errorPanel.hidden = true;
    filenameRow.hidden = false;
    filenameRow.textContent = `↳ ${file.name}`;
    scanSweep.hidden = false;

    const isImage = file.type.startsWith("image/");
    setStatus(isImage ? "Running OCR on image…" : "Parsing PDF text…");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong while processing the file.");
      }

      setStatus("Building engagement report…");
      renderReport(data);
      statusPanel.hidden = true;
      scanSweep.hidden = true;
    } catch (err) {
      scanSweep.hidden = true;
      statusPanel.hidden = true;
      showError(err.message || "Upload failed. Please try again.");
    }
  }

  function showError(message) {
    errorPanel.hidden = false;
    errorText.textContent = message;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlightReadout(text) {
    let safe = escapeHtml(text || "");
    safe = safe.replace(/#\w+/g, (m) => `<mark class="hl-hashtag">${m}</mark>`);
    const ctaPattern = /(comment|share|follow|subscribe|click|link in bio|dm|tag|save this|swipe)/gi;
    safe = safe.replace(ctaPattern, (m) => `<mark class="hl-cta">${m}</mark>`);
    return safe;
  }

  function renderReport(data) {
    const { extraction, analysis } = data;

    scoreNumber.textContent = analysis.score;

    statsGrid.innerHTML = "";
    Object.entries(STAT_LABELS).forEach(([key, label]) => {
      const val = analysis.stats[key];
      if (val === undefined) return;
      const item = document.createElement("div");
      item.className = "stat-item";
      item.innerHTML = `<span class="stat-value">${val}</span><span class="stat-key">${label}</span>`;
      statsGrid.appendChild(item);
    });

    extractionMethod.textContent =
      extraction.method === "tesseract-ocr"
        ? `· OCR${extraction.confidence ? " · " + Math.round(extraction.confidence) + "% confidence" : ""}`
        : `· PDF parse${extraction.pages ? " · " + extraction.pages + " page(s)" : ""}`;

    if (extraction.text && extraction.text.trim()) {
      readoutText.innerHTML = highlightReadout(extraction.text);
    } else {
      readoutText.innerHTML = `<span class="empty-note">No text could be extracted from this file.</span>`;
    }

    notesList.innerHTML = "";
    if (analysis.suggestions.length === 0) {
      notesList.innerHTML = `<p class="note-detail">No notes — this post looks solid.</p>`;
    } else {
      analysis.suggestions.forEach((s) => {
        const note = document.createElement("div");
        note.className = `note ${s.type}`;
        note.innerHTML = `<p class="note-title">${escapeHtml(s.title)}</p><p class="note-detail">${escapeHtml(s.detail)}</p>`;
        notesList.appendChild(note);
      });
    }

    report.hidden = false;
    report.scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
