# Scanline — Social Media Content Analyzer

Upload a PDF or a photo of a social media post, and get back the extracted text plus a rule-based engagement report: a score out of 100 and specific, actionable notes (missing hashtags, no call-to-action, sentence length, emoji use, and more).

## Features

- **Drag-and-drop or file-picker upload** for PDFs and images (PNG, JPG, WEBP, BMP)
- **PDF text extraction** via `pdfjs-dist`, preserving line/paragraph breaks
- **OCR for images** via `tesseract.js` (Tesseract compiled to WebAssembly — no external API key needed)
- **Engagement analysis**: word count, hashtags, mentions, links, emojis, questions, CTA detection, sentence length — turned into a 0–100 score and a list of margin notes
- **Loading states** during upload/extraction, and clear error messages for bad files or failed extraction
- **Custom UI** with all styling in an external stylesheet (`public/style.css`), no CSS frameworks

## Tech Stack

- **Backend**: Node.js, Express, Multer (uploads)
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

No environment variables are required. The server defaults to port `3000`; override with `PORT=xxxx npm start` if needed.

## Project Structure

```
social-content-analyzer/
├── server.js           # Express app: upload route, PDF/OCR extraction, engagement scoring
├── package.json
├── public/
│   ├── index.html
│   ├── style.css        # all styling lives here, external to the markup
│   └── script.js         # drag-and-drop, fetch call, report rendering
└── uploads/               # temp storage for in-flight uploads (cleared after each request)
```

## Approach (~200 words)

I split the app into two small, testable halves. The **backend** (`server.js`) accepts a file via Multer, routes it to one of two extractors — `pdfjs-dist` for PDFs (I initially tried `pdf-parse`, but its bundled PDF.js build failed to parse valid PDFs, so I switched to `pdfjs-dist` directly and rebuilt line-aware text from its text-content items) or `tesseract.js` for images — then runs the extracted text through a deterministic, rule-based analyzer. I chose rules over a hosted LLM call so the tool has no external API dependency for its core scoring logic, is instantly explainable, and answers offline for the PDF path.

The **frontend** is plain HTML/CSS/JS with no build step, styled entirely through an external stylesheet rather than inline styles or a framework, using a "scanner desk" visual identity — a light-table background, corner-bracket dropzone, and a monospace "readout" panel that highlights hashtags and CTA phrases inline, so the extracted text and the suggestions read like annotations on the same page.

Error handling covers unsupported file types, oversized files, empty extraction, and OCR worker failures — the last of these required patching `tesseract.js`'s default error behavior, which otherwise crashes the Node process rather than rejecting the request.

## Known Limitations

- OCR accuracy depends on image quality/resolution — very low-res or heavily stylized text may extract poorly.
- The engagement "score" is a heuristic, not a trained model — it's meant to surface clear, explainable signals rather than predict actual reach.
- Large scanned PDFs (image-only, no text layer) are not run through OCR automatically in this version — only the PDF's text layer is read.
