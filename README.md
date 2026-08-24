# Scanline — Social Media Content Analyzer

Upload a PDF or a photo of a social media post, and get back the extracted text plus a rule-based engagement report: a score out of 100 and specific, actionable notes (missing hashtags, no call-to-action, sentence length, emoji use, and more). Sign in to keep a personal log of every scan; switch between a light "Light Table" theme and a dark "Darkroom" theme any time.

## Features

- **Drag-and-drop or file-picker upload** for PDFs and images (PNG, JPG, WEBP, BMP)
- **PDF text extraction** via `pdfjs-dist`, preserving line/paragraph breaks
- **OCR for images** via `tesseract.js` (Tesseract compiled to WebAssembly — no external API key needed)
- **Engagement analysis**: word count, hashtags, mentions, links, emojis, questions, CTA detection, sentence length — turned into a 0–100 score and a list of margin notes
- **Accounts**: sign up / sign in with a username, email, and password (hashed with `bcryptjs`, never stored or returned in plain text)
- **Personal scan history**: every analysis run while signed in is saved to your own log — filename, score, stats, and a text preview — viewable and deletable from the "Log" section. Scans run while signed out still work, they just aren't saved.
- **Light / dark mode**: a "Daylight / Darkroom" toggle in the top bar, persisted in the browser and defaulting to your OS preference on first visit
- **Loading states** during upload/extraction, and clear error messages for bad files, failed extraction, or auth errors
- **Custom UI** with all styling in an external stylesheet (`public/style.css`), no CSS frameworks

## Tech Stack

- **Backend**: Node.js, Express, Multer (uploads), `express-session` (auth sessions), `bcryptjs` (password hashing)
- **Storage**: plain JSON files under `data/` (`users.json`, `history.json`) — no database server or native build step required
- **PDF parsing**: `pdfjs-dist` (text-layer extraction)
- **OCR**: `tesseract.js`
- **Frontend**: Plain HTML/CSS/JS — no build step, no framework

## Getting Started

```bash
git clone <your-repo-url>
cd social-content-analyzer
npm install
npm start
```

Then open **http://localhost:3000**.

> First-time OCR note: `tesseract.js` downloads its English language model (`eng.traineddata`) from a CDN the first time it runs, and caches it afterward. This requires normal internet access — no API key required, but it won't work in a fully offline/sandboxed environment. PDF text extraction has no such dependency and works fully offline.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Server port. Defaults to `3000`. |
| `SESSION_SECRET` | Recommended | Signs the login session cookie. If unset, a random secret is generated at boot, which means **everyone is signed out whenever the server restarts**. Set a fixed value (e.g. `openssl rand -hex 32`) for anything beyond local testing. |
| `NODE_ENV` | No | Set to `production` to mark session cookies `secure` (requires HTTPS). |

## Project Structure

```
social-content-analyzer/
├── server.js            # Express app: auth, upload route, PDF/OCR extraction, engagement scoring, history
├── lib/
│   ├── db.js             # Minimal JSON-file collection store (users, history)
│   ├── auth.js            # Signup/login logic, password hashing, session middleware
│   └── history.js          # Per-user scan log read/write helpers
├── data/                  # JSON "database" files, created on first run (git-ignore this in real use)
├── package.json
├── public/
│   ├── index.html          # Markup: dropzone, access panel (auth), readout/report, log
│   ├── style.css            # All styling — light/dark theme tokens live here
│   └── script.js              # Theme toggle, auth flow, upload + report rendering, history log
└── uploads/                  # temp storage for in-flight uploads (cleared after each request)
```

## Approach (~200 words)

I split the app into small, testable pieces. The **backend** (`server.js`) accepts a file via Multer, routes it to one of two extractors — `pdfjs-dist` for PDFs or `tesseract.js` for images — then runs the extracted text through a deterministic, rule-based analyzer. Auth and history are deliberately dependency-light: `express-session` for cookies, `bcryptjs` for hashing, and a hand-rolled JSON-file store (`lib/db.js`) instead of a database, so the project still installs and runs anywhere with no native build step or external service. Analyze requests work whether or not you're signed in; a scan is only written to `data/history.json` when a session is present, keeping the core tool usable without an account.

The **frontend** is plain HTML/CSS/JS with no build step, extending the original "scanner desk" identity: light mode is a paper "Light Table" (warm neutrals, teal accent), dark mode is a "Darkroom" (near-black, amber safelight accent), switched via a physical-feeling rocker toggle that persists to `localStorage`. Sign-in/sign-up live in an "access panel" modal; history renders as a stack of log cards.

Error handling covers unsupported file types, oversized files, empty extraction, OCR worker failures, duplicate accounts, and invalid credentials.

## Known Limitations

- OCR accuracy depends on image quality/resolution — very low-res or heavily stylized text may extract poorly.
- The engagement "score" is a heuristic, not a trained model — it's meant to surface clear, explainable signals rather than predict actual reach.
- Large scanned PDFs (image-only, no text layer) are not run through OCR automatically in this version — only the PDF's text layer is read.
- The JSON-file store and `express-session`'s default in-memory session store are fine for local use or a single small server, but won't scale across multiple processes/instances — swap in a real database and a shared session store (e.g. Redis) before deploying that way.
- There's no password-reset flow yet; a forgotten password currently means creating a new account.
