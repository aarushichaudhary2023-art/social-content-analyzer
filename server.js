const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { createWorker } = require("tesseract.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// --- Upload handling -------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/bmp",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, safe + path.extname(file.originalname || ""));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error("Unsupported file type. Please upload a PDF or an image (png/jpg/webp/bmp)."));
  },
});

// --- Text extraction ---------------------------------------------------

async function extractFromPdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pageTexts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items into lines based on their y-position to keep basic formatting.
    let lastY = null;
    let line = [];
    const lines = [];
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.join(" "));
        line = [];
      }
      line.push(item.str);
      lastY = y;
    }
    if (line.length) lines.push(line.join(" "));
    pageTexts.push(lines.join("\n"));
  }

  return {
    text: pageTexts.join("\n\n").trim(),
    pages: doc.numPages,
    method: "pdfjs-text-layer",
  };
}

async function extractFromImage(filePath) {
  let worker;
  let settled = false;

  return new Promise((resolve, reject) => {
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error("OCR engine error: " + err));
    };

    (async () => {
      try {
        worker = await createWorker("eng", 1, { errorHandler: fail });
        const { data } = await worker.recognize(filePath);
        if (settled) return;
        settled = true;
        resolve({ text: (data.text || "").trim(), confidence: data.confidence, method: "tesseract-ocr" });
      } catch (e) {
        fail(e);
      } finally {
        if (worker) {
          try {
            await worker.terminate();
          } catch (_) {
            /* already gone */
          }
        }
      }
    })();
  });
}

// --- Engagement analysis (rule-based, deterministic, no external API needed) ---

function analyzeEngagement(text) {
  const suggestions = [];
  const clean = text.trim();
  const wordCount = clean ? clean.split(/\s+/).length : 0;
  const charCount = clean.length;
  const hashtags = (clean.match(/#\w+/g) || []);
  const mentions = (clean.match(/@\w+/g) || []);
  const links = (clean.match(/https?:\/\/\S+/g) || []);
  const emojis = (clean.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []);
  const questionCount = (clean.match(/\?/g) || []).length;
  const exclamations = (clean.match(/!/g) || []).length;
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const avgSentenceLen = sentences.length ? wordCount / sentences.length : 0;
  const ctaWords = /(comment|share|follow|subscribe|click|link in bio|dm|tag|save this|swipe)/i;
  const hasCTA = ctaWords.test(clean);

  let score = 50;

  // Length
  if (wordCount === 0) {
    suggestions.push({
      type: "warning",
      title: "No readable text found",
      detail: "Extraction returned no text. Try a higher-resolution scan or a text-based PDF.",
    });
  } else if (wordCount < 8) {
    suggestions.push({
      type: "tip",
      title: "Post is very short",
      detail: `Only ${wordCount} words detected. Short posts can work for punchy visuals, but adding one line of context often lifts comments.`,
    });
    score -= 5;
  } else if (wordCount > 150) {
    suggestions.push({
      type: "tip",
      title: "Post may be too long for feed skimming",
      detail: `${wordCount} words is dense for a feed post. Consider trimming to the strongest 2-3 sentences and moving detail to a comment or thread.`,
    });
    score -= 5;
  } else {
    score += 10;
  }

  // Hashtags
  if (hashtags.length === 0) {
    suggestions.push({
      type: "tip",
      title: "No hashtags detected",
      detail: "Adding 2-5 relevant hashtags typically improves discoverability outside your existing followers.",
    });
  } else if (hashtags.length > 8) {
    suggestions.push({
      type: "warning",
      title: "Hashtag overload",
      detail: `${hashtags.length} hashtags found. Beyond ~5-8, extra tags tend to read as spammy and can suppress reach on some platforms.`,
    });
    score -= 5;
  } else {
    score += 8;
  }

  // CTA
  if (!hasCTA && questionCount === 0) {
    suggestions.push({
      type: "tip",
      title: "No clear call-to-action",
      detail: "Neither a direct ask (comment, share, save) nor a question was found. A single explicit CTA usually raises engagement.",
    });
  } else {
    score += 10;
  }

  // Questions
  if (questionCount > 0) {
    suggestions.push({
      type: "positive",
      title: "Question detected",
      detail: "Asking a question is one of the most reliable ways to prompt comments — keep it specific and easy to answer.",
    });
    score += 8;
  }

  // Emojis
  if (emojis.length === 0) {
    suggestions.push({
      type: "tip",
      title: "No emojis used",
      detail: "A well-placed emoji or two can break up text and add tone, especially at the start of a line.",
    });
  } else if (emojis.length > 10) {
    suggestions.push({
      type: "warning",
      title: "Heavy emoji use",
      detail: `${emojis.length} emojis detected. This can look cluttered — consider trimming to the ones that carry real meaning.`,
    });
    score -= 3;
  } else {
    score += 5;
  }

  // Links
  if (links.length > 0) {
    suggestions.push({
      type: "tip",
      title: "Contains a raw link",
      detail: "Some platforms deprioritize posts with outbound links. Consider 'link in bio' phrasing instead of a raw URL where relevant.",
    });
  }

  // Sentence complexity
  if (avgSentenceLen > 25) {
    suggestions.push({
      type: "tip",
      title: "Long, complex sentences",
      detail: `Average sentence length is ~${avgSentenceLen.toFixed(0)} words. Shorter sentences are easier to skim on mobile feeds.`,
    });
    score -= 3;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    stats: {
      wordCount,
      charCount,
      hashtagCount: hashtags.length,
      mentionCount: mentions.length,
      linkCount: links.length,
      emojiCount: emojis.length,
      questionCount,
      exclamationCount: exclamations,
      avgSentenceLength: Number(avgSentenceLen.toFixed(1)),
      hasCTA,
    },
    hashtags,
    mentions,
    score,
    suggestions,
  };
}

// --- Routes -------------------------------------------------------------

app.post("/api/analyze", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file received." });
    }

    const filePath = req.file.path;

    try {
      let extraction;
      if (req.file.mimetype === "application/pdf") {
        extraction = await extractFromPdf(filePath);
      } else {
        extraction = await extractFromImage(filePath);
      }

      const analysis = analyzeEngagement(extraction.text || "");

      res.json({
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        extraction,
        analysis,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to process file. " + (e.message || "") });
    } finally {
      fs.unlink(filePath, () => {});
    }
  });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

app.listen(PORT, () => {
  console.log(`Social Media Content Analyzer running at http://localhost:${PORT}`);
});
