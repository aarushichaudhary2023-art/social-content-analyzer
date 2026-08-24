// lib/db.js
//
// Tiny JSON-file "database" for users and per-user scan history.
// No native dependencies (no sqlite/node-gyp) so it installs anywhere.
// Writes are serialized through an in-process queue so two concurrent
// requests can't clobber each other's changes.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

class JsonCollection {
  constructor(name) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    this._writeQueue = Promise.resolve();
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, "[]", "utf8");
    }
  }

  _readAll() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // Corrupt or mid-write file: fail safe to an empty collection
      // rather than crashing the server.
      console.error(`Failed to read ${this.file}:`, e.message);
      return [];
    }
  }

  _writeAll(records) {
    // Queue writes so overlapping requests serialize instead of racing.
    this._writeQueue = this._writeQueue.then(
      () =>
        new Promise((resolve, reject) => {
          const tmp = this.file + ".tmp";
          fs.writeFile(tmp, JSON.stringify(records, null, 2), "utf8", (err) => {
            if (err) return reject(err);
            fs.rename(tmp, this.file, (err2) => (err2 ? reject(err2) : resolve()));
          });
        })
    );
    return this._writeQueue;
  }

  all() {
    return this._readAll();
  }

  find(predicate) {
    return this._readAll().find(predicate) || null;
  }

  filter(predicate) {
    return this._readAll().filter(predicate);
  }

  async insert(record) {
    const records = this._readAll();
    records.push(record);
    await this._writeAll(records);
    return record;
  }

  async remove(predicate) {
    const records = this._readAll();
    const kept = records.filter((r) => !predicate(r));
    const removedCount = records.length - kept.length;
    if (removedCount > 0) await this._writeAll(kept);
    return removedCount;
  }
}

const users = new JsonCollection("users");
const history = new JsonCollection("history");

module.exports = { users, history };
