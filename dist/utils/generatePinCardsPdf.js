"use strict";
/**
 * generatePinCardsPdf.ts
 * ---------------------------------------------------------------------------
 * Generates a print-ready PDF of student PIN / result-access cards.
 *
 * Layout:
 *   Page 1        -> the "front" template of the card (branding only, no
 *                     serial/PIN) — an exact replica of the reference design.
 *   Pages 2..N    -> the "back" of every card, 10 per page (2 columns x 5
 *                     rows), each showing that card's unique SERIAL and PIN.
 *
 * Rendering strategy:
 *   We build the whole document as HTML/CSS and render it with Puppeteer
 *   (headless Chrome). This is the only reliable way to get pixel-perfect
 *   fidelity (rounded corners, a dark side panel with rotated text, subtle
 *   watermark letter, exact spacing) without hand-rolling vector drawing.
 *
 * Password protection:
 *   Puppeteer/Chrome cannot itself set a PDF *open* password. After
 *   rendering we run the file through `qpdf` (via the `node-qpdf2` wrapper)
 *   to encrypt it with the given password. If you don't have qpdf available
 *   in your deploy environment, swap `encryptPdfBuffer` for whatever
 *   encryption utility you already use — it's isolated on purpose.
 *
 * Dependencies (npm):
 *   npm i puppeteer qrcode node-qpdf2
 *   qpdf must also be installed on the host/container (`apt-get install qpdf`
 *   or the equivalent for your platform) since node-qpdf2 shells out to it.
 * ---------------------------------------------------------------------------
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePinCardsPdf = generatePinCardsPdf;
exports.generateCardSerial = generateCardSerial;
exports.generateCardPin = generateCardPin;
const puppeteer_1 = __importDefault(require("puppeteer"));
const qrcode_1 = __importDefault(require("qrcode"));
const node_qpdf2_1 = __importDefault(require("node-qpdf2"));
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
// Layout constants ------------------------------------------------------
const CARDS_PER_PAGE = 10;
const CARDS_PER_ROW = 2;
const DEFAULT_PRIMARY = "#0A1628"; // deep navy, matches reference design
const DEFAULT_ACCENT = "#C9A227"; // muted gold, matches reference design
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
async function generatePinCardsPdf(options) {
    const { cards, termLabel, brand, schoolName, password, protectUrl, accessToken, } = options;
    if (!cards || cards.length === 0) {
        throw new Error("generatePinCardsPdf: `cards` must contain at least one card.");
    }
    const resolvedBrand = resolveBrand({ brand, schoolNameOverride: schoolName });
    // Pre-generate a QR code per card (optional — only if a verification URL
    // was supplied). Done up front so HTML building stays synchronous.
    const qrByCardId = protectUrl
        ? await generateQrCodesForCards(cards, protectUrl, accessToken)
        : new Map();
    const html = buildDocumentHtml({
        cards,
        termLabel,
        brand: resolvedBrand,
        qrByCardId,
    });
    const rawPdf = await renderHtmlToPdfBuffer(html);
    const finalPdf = password ? await encryptPdfBuffer(rawPdf, password) : rawPdf;
    return finalPdf;
}
// ---------------------------------------------------------------------------
// Brand resolution
// ---------------------------------------------------------------------------
function resolveBrand(input) {
    const { brand, schoolNameOverride } = input;
    return {
        schoolName: schoolNameOverride ?? brand?.schoolName ?? "School",
        primary: normalizeHexColor(brand?.primaryColor) ?? DEFAULT_PRIMARY,
        accent: normalizeHexColor(brand?.accentColor) ?? DEFAULT_ACCENT,
    };
}
/** Accepts "#0A1628", "0A1628", or falsy input; returns "#RRGGBB" or null. */
function normalizeHexColor(value) {
    if (!value)
        return null;
    const trimmed = value.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(withHash);
    return isValidHex ? withHash.toUpperCase() : null;
}
// ---------------------------------------------------------------------------
// QR code generation (optional — only when `protectUrl` is provided)
// ---------------------------------------------------------------------------
/**
 * IMPORTANT: the QR code intentionally encodes only the serial + access
 * token, never the PIN. The PIN sits under a "scratch panel" on the printed
 * card; if it were embedded in the QR code, anyone could scan the card
 * before it's scratched and read the PIN straight off the URL.
 */
async function generateQrCodesForCards(cards, protectUrl, accessToken) {
    const entries = await Promise.all(cards.map(async (card) => {
        const url = buildVerificationUrl(protectUrl, card.serial, accessToken);
        const dataUrl = await qrcode_1.default.toDataURL(url, {
            margin: 0,
            width: 160,
            color: { dark: "#000000", light: "#00000000" },
        });
        return [card.id, dataUrl];
    }));
    return new Map(entries);
}
function buildVerificationUrl(protectUrl, serial, accessToken) {
    const url = new URL(protectUrl);
    url.searchParams.set("serial", serial);
    if (accessToken)
        url.searchParams.set("token", accessToken);
    return url.toString();
}
// ---------------------------------------------------------------------------
// HTML document assembly
// ---------------------------------------------------------------------------
function buildDocumentHtml(input) {
    const { cards, termLabel, brand, qrByCardId } = input;
    const frontPageHtml = buildFrontPageHtml(brand, termLabel);
    const backPagesHtml = buildBackPagesHtml(cards, brand, termLabel, qrByCardId);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>${getSharedStyles(brand)}</style>
</head>
<body>
  ${frontPageHtml}
  ${backPagesHtml}
</body>
</html>`;
}
/** Shared CSS reused by both the front template page and every back page. */
function getSharedStyles(brand) {
    return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      color: #1A1E27;
    }

    .sheet {
      width: 210mm;
      height: 297mm;
      padding: 14mm 12mm;
      page-break-after: always;
      position: relative;
    }
    .sheet:last-child { page-break-after: auto; }

    /* ---------------- Front template page ---------------- */
    .front-page {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .front-page .card {
      width: 150mm;
    }

    /* ---------------- Shared card shell ---------------- */
    .card {
      display: flex;
      border-radius: 6mm;
      overflow: hidden;
      background: #F7F5EF;
      border: 0.3mm solid rgba(10,10,10,0.06);
      aspect-ratio: 16 / 8.7;
      position: relative;
    }

    .card__main {
      flex: 1;
      padding: 7mm 8mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
      min-width: 0;
    }

    /* Giant faint watermark letter, echoing the reference design */
    .card__watermark {
      position: absolute;
      right: -4mm;
      bottom: -14mm;
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 700;
      font-size: 60mm;
      line-height: 1;
      color: rgba(10, 10, 10, 0.04);
      pointer-events: none;
      user-select: none;
    }

    .card__eyebrow {
      font-size: 2.6mm;
      font-weight: 700;
      letter-spacing: 0.35mm;
      text-transform: uppercase;
      color: ${brand.accent};
      margin-bottom: 2.5mm;
    }

    .card__title {
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 700;
      font-size: 6.2mm;
      line-height: 1.18;
      color: ${brand.primary};
      max-width: 85%;
    }

    .card__subtitle {
      margin-top: 2.5mm;
      font-size: 3mm;
      color: #6B7280;
    }

    .card__meta {
      margin-top: 1.2mm;
      font-size: 2.3mm;
      letter-spacing: 0.2mm;
      text-transform: uppercase;
      color: #9AA1AC;
    }

    .card__rule {
      width: 12mm;
      height: 0.5mm;
      background: ${brand.accent};
      margin: 3.5mm 0;
    }

    .card__footnote {
      font-size: 2.3mm;
      line-height: 1.5;
      color: #9AA1AC;
    }

    /* ---------------- Dark side panel ---------------- */
    .card__side {
      width: 15mm;
      flex-shrink: 0;
      background: ${brand.primary};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 4mm 0;
      position: relative;
    }

    .card__badge {
      width: 7mm;
      height: 7mm;
      border-radius: 1.6mm;
      border: 0.25mm solid rgba(201, 162, 39, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 700;
      font-size: 3.2mm;
      color: ${brand.accent};
    }

    .card__side-label {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 2.6mm;
      font-weight: 600;
      letter-spacing: 0.6mm;
      text-transform: uppercase;
      color: #EDE6D3;
    }

    .card__side-dot {
      width: 1.6mm;
      height: 1.6mm;
      border-radius: 50%;
      background: ${brand.accent};
    }

    /* ---------------- Back-of-card grid pages ---------------- */
    .back-page {
      display: flex;
      flex-direction: column;
    }
    .back-page__header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 6mm;
      font-size: 3mm;
      color: #9AA1AC;
    }
    .back-page__header strong {
      color: ${brand.primary};
      font-weight: 700;
    }

    .back-grid {
      display: grid;
      grid-template-columns: repeat(${CARDS_PER_ROW}, 1fr);
      gap: 6mm;
      align-content: start;
    }

    /* Back-of-card content (reuses .card / .card__side shell above) */
    .card--back .card__main {
      padding: 5mm 6mm;
      justify-content: space-between;
    }
    .back-card__top {
      display: flex;
      align-items: center;
      gap: 2.5mm;
    }
    .back-card__monogram {
      width: 6mm;
      height: 6mm;
      border-radius: 1.3mm;
      background: ${brand.primary};
      color: ${brand.accent};
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 700;
      font-size: 2.8mm;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .back-card__school {
      font-size: 2.4mm;
      font-weight: 700;
      color: ${brand.primary};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .back-card__term {
      font-size: 2mm;
      color: #9AA1AC;
      text-transform: uppercase;
      letter-spacing: 0.2mm;
    }

    .back-card__field-label {
      font-size: 1.9mm;
      font-weight: 700;
      letter-spacing: 0.3mm;
      text-transform: uppercase;
      color: #9AA1AC;
      margin-bottom: 0.8mm;
    }
    .back-card__serial {
      font-family: 'Courier New', monospace;
      font-size: 3.1mm;
      font-weight: 700;
      color: #1A1E27;
      letter-spacing: 0.3mm;
    }

    .back-card__scratch-panel {
      margin-top: 2mm;
      border: 0.35mm dashed ${brand.accent};
      border-radius: 1.6mm;
      padding: 1.8mm 2.5mm;
      background: rgba(201, 162, 39, 0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .back-card__pin {
      font-family: 'Courier New', monospace;
      font-size: 3.6mm;
      font-weight: 700;
      letter-spacing: 0.8mm;
      color: ${brand.primary};
    }
    .back-card__scratch-tag {
      font-size: 1.7mm;
      font-weight: 700;
      letter-spacing: 0.2mm;
      text-transform: uppercase;
      color: ${brand.accent};
    }

    .back-card__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 2mm;
    }
    .back-card__qr {
      width: 9mm;
      height: 9mm;
    }
    .back-card__url {
      font-size: 1.7mm;
      color: #9AA1AC;
      max-width: 30mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}
/** Page 1 — the front-of-card template. Text mirrors the reference design. */
function buildFrontPageHtml(brand, termLabel) {
    return `
  <section class="sheet front-page">
    <div class="card">
      <div class="card__main">
        <div class="card__watermark">${escapeHtml(firstLetter(brand.schoolName))}</div>
        <div class="card__eyebrow">Official Result Card</div>
        <div class="card__title">${escapeHtml(brand.schoolName)}</div>
        <div class="card__subtitle">Result access card</div>
        <div class="card__meta">${escapeHtml(termLabel)}</div>
        <div class="card__rule"></div>
        <div class="card__footnote">
          Scratch or reveal the back.<br />
          One card &middot; one check.
        </div>
      </div>
      <div class="card__side">
        <div class="card__badge">P</div>
        <div class="card__side-label">Portals</div>
        <div class="card__side-dot"></div>
      </div>
    </div>
  </section>`;
}
/** Pages 2..N — every card's back, chunked 10-per-page. */
function buildBackPagesHtml(cards, brand, termLabel, qrByCardId) {
    const pages = chunkArray(cards, CARDS_PER_PAGE);
    return pages
        .map((pageCards, pageIndex) => {
        const cardsHtml = pageCards
            .map((card) => buildBackCardHtml(card, brand, termLabel, qrByCardId.get(card.id)))
            .join("");
        return `
      <section class="sheet back-page">
        <div class="back-page__header">
          <span><strong>${escapeHtml(brand.schoolName)}</strong> &middot; ${escapeHtml(termLabel)}</span>
          <span>Page ${pageIndex + 1} of ${pages.length}</span>
        </div>
        <div class="back-grid">${cardsHtml}</div>
      </section>`;
    })
        .join("");
}
function buildBackCardHtml(card, brand, termLabel, qrDataUrl) {
    const qrBlock = qrDataUrl
        ? `<img class="back-card__qr" src="${qrDataUrl}" alt="Verification QR code" />`
        : `<span></span>`;
    return `
    <div class="card card--back">
      <div class="card__main">
        <div>
          <div class="back-card__top">
            <div class="back-card__monogram">${escapeHtml(firstLetter(brand.schoolName))}</div>
            <div>
              <div class="back-card__school">${escapeHtml(brand.schoolName)}</div>
              <div class="back-card__term">${escapeHtml(termLabel)}</div>
            </div>
          </div>

          <div style="margin-top: 3mm;">
            <div class="back-card__field-label">Serial</div>
            <div class="back-card__serial">${escapeHtml(card.serial)}</div>
          </div>

          <div class="back-card__scratch-panel">
            <span class="back-card__pin">${escapeHtml(card.pin)}</span>
            <span class="back-card__scratch-tag">Scratch&nbsp;Area</span>
          </div>
        </div>

        <div class="back-card__footer">
          ${qrBlock}
          <span class="back-card__url">One card &middot; one check</span>
        </div>
      </div>
      <div class="card__side">
        <div class="card__badge">P</div>
        <div class="card__side-label">Portals</div>
        <div class="card__side-dot"></div>
      </div>
    </div>`;
}
// ---------------------------------------------------------------------------
// Rendering (HTML -> PDF via headless Chrome)
// ---------------------------------------------------------------------------
async function renderHtmlToPdfBuffer(html) {
    let browser;
    try {
        browser = await puppeteer_1.default.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
        });
        return Buffer.from(pdf);
    }
    finally {
        await browser?.close();
    }
}
// ---------------------------------------------------------------------------
// Encryption (password-protect the final PDF via qpdf)
// ---------------------------------------------------------------------------
async function encryptPdfBuffer(pdfBuffer, password) {
    const tempDir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), "pin-cards-"));
    const inputPath = path_1.default.join(tempDir, "input.pdf");
    const outputPath = path_1.default.join(tempDir, "output.pdf");
    try {
        await fs_1.promises.writeFile(inputPath, pdfBuffer);
        await node_qpdf2_1.default.encrypt({
            input: inputPath,
            output: outputPath,
            password: { user: password, owner: password },
            restrictions: {
                print: "full",
                modify: "none",
                extract: "n",
                useAes: "y",
            },
            // node-qpdf2 defaults to 256-bit encryption; adjust `keyLength` if your
            // qpdf version / compliance requirements need 128-bit instead.
        });
        return await fs_1.promises.readFile(outputPath);
    }
    finally {
        await fs_1.promises.rm(tempDir, { recursive: true, force: true });
    }
}
// ---------------------------------------------------------------------------
// Small, reusable utilities
// ---------------------------------------------------------------------------
function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
function firstLetter(value) {
    return (value.trim()[0] ?? "S").toUpperCase();
}
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/** Generates a short, print-friendly random serial (override as needed). */
function generateCardSerial(prefix = "") {
    const random = crypto_1.default.randomBytes(4).toString("hex").toUpperCase();
    return `${prefix}${random}`;
}
/** Generates a fixed-length numeric PIN (override as needed). */
function generateCardPin(length = 6) {
    const max = 10 ** length;
    const value = crypto_1.default.randomInt(0, max);
    return value.toString().padStart(length, "0");
}
