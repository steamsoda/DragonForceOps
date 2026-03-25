"use client";

// ── QZ Tray types ─────────────────────────────────────────────────────────────

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz: any;
  }
}

// ── Load QZ Tray script ───────────────────────────────────────────────────────

let loadPromise: Promise<void> | null = null;

function loadQZScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined") return Promise.reject(new Error("Server-side"));
  if (window.qz) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/qz-tray.js";
    script.onload = () => (window.qz ? resolve() : reject(new Error("QZ loaded but window.qz missing")));
    script.onerror = () => reject(new Error("Could not load /qz-tray.js — make sure the file is in /public"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

// ── Connect to QZ Tray ────────────────────────────────────────────────────────

const QZ_CERTIFICATE = (process.env.NEXT_PUBLIC_QZ_CERTIFICATE ?? "").replace(/\\n/g, "\n").trim();

export async function connectQZ(): Promise<void> {
  await loadQZScript();
  const qz = window.qz;

  if (qz.websocket.isActive()) return;

  if (QZ_CERTIFICATE) {
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(QZ_CERTIFICATE));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign: string) =>
      (resolve: (sig: string) => void, reject: (err: Error) => void) => {
        fetch("/api/sign-qz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: toSign }),
        }).then((res) => {
          if (!res.ok) return res.text().then((t) => { reject(new Error(t)); });
          return res.text().then(resolve);
        }).catch(reject);
      }
    );
  } else {
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(""));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((_toSign: string) => (resolve: (sig: string) => void) => resolve(""));
  }

  await qz.websocket.connect({ retries: 3, delay: 1 });
}

// ── Item types ────────────────────────────────────────────────────────────────
// QZ Tray raw printing supports: "plain" | "base64" | "hex" | "file" | "xml"
// Images must be pre-converted to ESC/POS raster bytes and sent as "base64".

type QZDataItem =
  | { type: "raw"; format: "plain"; data: string }
  | { type: "raw"; format: "base64"; data: string };

// Encode a JS string to base64 using CP1252 byte values.
// QZ Tray transmits "plain" strings as UTF-8 over the WebSocket, so ñ (U+00F1)
// arrives at the printer as two UTF-8 bytes (0xC3 0xB1) instead of one CP1252
// byte (0xF1). Sending pre-encoded base64 bypasses QZ Tray's text handling
// entirely and delivers the correct single byte to the ESC/POS printer.
// Latin-1 supplement chars (U+00A0–U+00FF) are identical in CP1252, so a
// direct charCodeAt passthrough is sufficient for all Spanish characters.
function encodeCP1252Base64(str: string): string {
  let binary = "";
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    binary += String.fromCharCode(c <= 0xff ? c : 0x3f); // 0x3f = '?' for unmappable chars
  }
  return btoa(binary);
}

function t(data: string): QZDataItem {
  return { type: "raw", format: "base64", data: encodeCP1252Base64(data) };
}

// ── ESC/POS image conversion ──────────────────────────────────────────────────
// Converts an image URL to a GS v 0 ESC/POS raster command (base64 encoded).
// Uses Canvas to dither to 1-bit monochrome, then builds the binary header + bitmap.

async function imageUrlToESCPOS(url: string, maxWidth = 384): Promise<string | null> {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });

    // Scale to fit maxWidth, maintaining aspect ratio
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const w = Math.floor(img.naturalWidth * scale);
    const h = Math.floor(img.naturalHeight * scale);

    // Draw to offscreen canvas with white background
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const { data: pixels } = ctx.getImageData(0, 0, w, h);

    // Build 1-bit bitmap: MSB = leftmost pixel, 1 = black
    const bytesPerRow = Math.ceil(w / 8);
    const bitmap = new Uint8Array(bytesPerRow * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const gray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (gray < 128) {
          bitmap[y * bytesPerRow + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
        }
      }
    }

    // GS v 0: 1D 76 30 00 xL xH yL yH [bitmap]
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = h & 0xff;
    const yH = (h >> 8) & 0xff;
    const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

    const combined = new Uint8Array(header.length + bitmap.length);
    combined.set(header);
    combined.set(bitmap, header.length);

    // Encode as base64 in chunks (avoids stack overflow on large images)
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < combined.length; i += chunkSize) {
      binary += String.fromCharCode(...combined.subarray(i, i + chunkSize));
    }
    return btoa(binary);

  } catch {
    return null;
  }
}

// ── Logo loader (cached after first conversion) ───────────────────────────────

let cachedLogoESCPOS: string | null | undefined;

async function fetchLogoESCPOS(): Promise<string | null> {
  if (cachedLogoESCPOS !== undefined) return cachedLogoESCPOS;
  cachedLogoESCPOS = await imageUrlToESCPOS("/logos-porto-recibo.png", 384);
  return cachedLogoESCPOS;
}

// ── ESC/POS text helpers ──────────────────────────────────────────────────────

const ESC = "\x1B";
const GS  = "\x1D";

function center(text: string, width = 42): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function row(left: string, right: string, width = 42): string {
  const maxLeft = width - right.length - 1;
  const l = left.length > maxLeft ? left.slice(0, maxLeft - 1) + "…" : left;
  return l + " ".repeat(width - l.length - right.length) + right;
}

function divider(char = "-", width = 42): string {
  return char.repeat(width);
}

// ── Receipt builder ───────────────────────────────────────────────────────────

export type ReceiptData = {
  playerName: string;
  campusName: string;
  method: string;
  amount: number;
  currency: string;
  remainingBalance: number;
  chargesPaid: { description: string; amount: number }[];
  paymentId: string;
  date: string;
  time: string;
};

function buildReceiptHeader(campusName: string, logoESCPOS: string | null): QZDataItem[] {
  const items: QZDataItem[] = [t(`${ESC}@`)]; // initialize printer

  if (logoESCPOS) {
    items.push(t("\n"));                                      // top margin
    items.push(t(`${ESC}a\x01`));                            // center align (affects raster image position)
    items.push({ type: "raw", format: "base64", data: logoESCPOS });
    items.push(t("\n"));                                      // gap between logo and campus name
    items.push(t(`${campusName}\n`));                         // still centered
    items.push(t("\n"));                                      // bottom margin before divider
    items.push(t(`${ESC}a\x00`));                            // back to left
  } else {
    items.push(
      t(`${ESC}a\x01`),       // center
      t(`${ESC}!\x10`),       // double-height font
      t("INVICTA\n"),
      t(`${ESC}!\x00`),       // normal font
      t("FC Porto Dragon Force\n"),
      t(`${campusName}\n`),
      t(`${ESC}a\x00`),       // left align
    );
  }
  return items;
}

function buildReceipt(r: ReceiptData, logoESCPOS: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency }).format(n);
  const shortId = r.paymentId.slice(-8).toUpperCase();

  const header = buildReceiptHeader(r.campusName, logoESCPOS);

  const meta: QZDataItem[] = [
    t(divider() + "\n"),
    t(`Alumno: ${r.playerName}\n`),
    t(`Fecha:  ${r.date}\n`),
    t(`Hora:   ${r.time}\n`),
    t(`Metodo: ${r.method}\n`),
    t(`Folio:  ${shortId}\n`),
    t(divider() + "\n"),
  ];

  const chargeLines: QZDataItem[] = r.chargesPaid.map((c) => t(row(c.description, fmt(c.amount)) + "\n"));

  function footer(label: string): QZDataItem[] {
    const items: QZDataItem[] = [
      t(divider("=") + "\n"),
      t(`${ESC}E\x01`),
      t(row("TOTAL PAGADO", fmt(r.amount)) + "\n"),
      t(`${ESC}E\x00`),
    ];
    if (r.remainingBalance > 0) {
      items.push(t(row("Saldo pendiente", fmt(r.remainingBalance)) + "\n"));
    } else if (r.remainingBalance === 0) {
      items.push(t(center("Cuenta al corriente  ✓") + "\n"));
    } else {
      items.push(t(center(`Credito: ${fmt(Math.abs(r.remainingBalance))}`) + "\n"));
    }
    items.push(t(divider() + "\n"), t(center("Gracias por su pago") + "\n"), t(center(label) + "\n"), t("\n\n\n\n"));
    return items;
  }

  return [
    ...header, ...meta, ...chargeLines, ...footer("-- COPIA CLIENTE --"),
    t(`${GS}V\x41\x03`), // partial cut
    // Copy 2 — academy
    ...header, ...meta, ...chargeLines, ...footer("-- COPIA ACADEMIA --"),
    t(`${GS}V\x00`), // full cut
  ];
}

// ── Corte Diario builder ──────────────────────────────────────────────────────

export type CorteData = {
  date: string;
  campusLabel: string;
  totalCobrado: number;
  currency: string;
  byMethod: { methodLabel: string; count: number; total: number }[];
  byChargeType: { typeName: string; total: number }[];
  payments: { playerName: string; amount: number; methodLabel: string; paidAt: string }[];
};

function buildCorte(c: CorteData, logoESCPOS: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: c.currency }).format(n);

  const now = new Date();
  const printedAt = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const items: QZDataItem[] = [
    ...buildReceiptHeader(c.campusLabel, logoESCPOS),
    t(divider() + "\n"),
    t(`CORTE DIARIO: ${c.date}\n`),
    t(`Impreso: ${printedAt}\n`),
    t(divider() + "\n"),
    t(`${ESC}E\x01`),
    t(row("TOTAL COBRADO", fmt(c.totalCobrado)) + "\n"),
    t(`${ESC}E\x00`),
    t(divider() + "\n"),
  ];

  if (c.byMethod.length > 0) {
    items.push(t("Por metodo de pago:\n"));
    for (const m of c.byMethod) {
      items.push(t(row(`${m.methodLabel} (${m.count})`, fmt(m.total)) + "\n"));
    }
    items.push(t(divider() + "\n"));
  }

  if (c.byChargeType.length > 0) {
    items.push(t("Por tipo de cargo:\n"));
    for (const tp of c.byChargeType) {
      items.push(t(row(tp.typeName, fmt(tp.total)) + "\n"));
    }
    items.push(t(divider() + "\n"));
  }

  if (c.payments.length > 0) {
    items.push(t(`Detalle (${c.payments.length} cobros):\n`));
    for (const p of c.payments) {
      const time = new Date(p.paidAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Monterrey" });
      items.push(t(`${time} ${p.methodLabel.slice(0, 4).padEnd(4)} ${fmt(p.amount).padStart(10)} ${p.playerName.slice(0, 18)}\n`));
    }
    items.push(t(divider() + "\n"));
  }

  items.push(t(center("-- fin del corte --") + "\n"), t("\n\n\n"), t(`${GS}V\x00`));
  return items;
}

// ── Send to QZ Tray ───────────────────────────────────────────────────────────

async function sendToQZ(printerName: string, items: QZDataItem[]): Promise<void> {
  await connectQZ();
  const qz = window.qz;
  const config = qz.configs.create(printerName, { encoding: "Cp1252" });
  await qz.print(config, items);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function printReceipt(printerName: string, data: ReceiptData): Promise<void> {
  const logo = await fetchLogoESCPOS();
  await sendToQZ(printerName, buildReceipt(data, logo));
}

export async function printCorte(printerName: string, data: CorteData): Promise<void> {
  const logo = await fetchLogoESCPOS();
  await sendToQZ(printerName, buildCorte(data, logo));
}

export async function printTestPage(printerName: string): Promise<void> {
  const now = new Date().toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  await sendToQZ(printerName, [
    t(`${ESC}@`),
    t(`${ESC}a\x01`),
    t("================================\n"),
    t("   PRUEBA DE IMPRESORA\n"),
    t("   Dragon Force Ops\n"),
    t(`   ${now}\n`),
    t("================================\n"),
    t("   Impresora: OK\n"),
    t(`   ${printerName}\n`),
    t("================================\n"),
    t("\n\n\n\n"),
    t(`${ESC}d\x04`),
  ]);
}
