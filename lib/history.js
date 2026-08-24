// lib/history.js
//
// Per-user log of past scans (uploads + their analysis results).

const crypto = require("crypto");
const { history } = require("./db");

const MAX_PREVIEW_CHARS = 400;
const MAX_HISTORY_PER_USER = 200; // soft cap so one user's log file can't grow forever

async function recordScan({ userId, filename, mimetype, extraction, analysis }) {
  const entry = {
    id: crypto.randomUUID(),
    userId,
    filename,
    mimetype,
    method: extraction.method,
    score: analysis.score,
    stats: analysis.stats,
    textPreview: (extraction.text || "").slice(0, MAX_PREVIEW_CHARS),
    createdAt: new Date().toISOString(),
  };
  await history.insert(entry);

  // Trim oldest entries beyond the cap for this user (best-effort housekeeping).
  const mine = history.filter((h) => h.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  if (mine.length > MAX_HISTORY_PER_USER) {
    const toDrop = new Set(mine.slice(0, mine.length - MAX_HISTORY_PER_USER).map((h) => h.id));
    await history.remove((h) => toDrop.has(h.id));
  }

  return entry;
}

function listForUser(userId, { limit = 50 } = {}) {
  return history
    .filter((h) => h.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

async function deleteForUser(userId, entryId) {
  return history.remove((h) => h.userId === userId && h.id === entryId);
}

module.exports = { recordScan, listForUser, deleteForUser };
