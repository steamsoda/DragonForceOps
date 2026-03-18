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
// QZ Tray must be running on the machine and set to allow unsigned requests.

export async function connectQZ(): Promise<void> {
  await loadQZScript();
  const qz = window.qz;

  if (qz.websocket.isActive()) return;

  // No certificate signing — set QZ Tray → Advanced → "Allow all" for internal use
  qz.security.setCertificatePromise((_resolve: (v: string) => void) => _resolve(""));
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((_toSign: string) => (_resolve: (v: string) => void) => _resolve(""));

  await qz.websocket.connect({ retries: 3, delay: 1 });
}

// ── ESC/POS receipt builder ───────────────────────────────────────────────────

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

function buildReceipt(r: ReceiptData): string[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency }).format(n);
  const shortId = r.paymentId.slice(-8).toUpperCase();

  const lines: string[] = [
    `${ESC}@`,           // Initialize
    `${ESC}a\x01`,       // Center align

    `${ESC}!\x10`,       // Double-height font
    "INVICTA\n",
    `${ESC}!\x00`,       // Normal font
    "FC Porto Dragon Force\n",
    `${r.campusName}\n`,

    divider() + "\n",

    `${ESC}a\x00`,       // Left align
    `Alumno: ${r.playerName}\n`,
    `Fecha:  ${r.date}\n`,
    `Hora:   ${r.time}\n`,
    `Metodo: ${r.method}\n`,
    `Folio:  ${shortId}\n`,
    divider() + "\n",
  ];

  for (const c of r.chargesPaid) {
    lines.push(row(c.description, fmt(c.amount)) + "\n");
  }

  lines.push(
    divider("=") + "\n",
    `${ESC}E\x01`,       // Bold on
    row("TOTAL PAGADO", fmt(r.amount)) + "\n",
    `${ESC}E\x00`,       // Bold off
  );

  if (r.remainingBalance > 0) {
    lines.push(row("Saldo pendiente", fmt(r.remainingBalance)) + "\n");
  } else if (r.remainingBalance === 0) {
    lines.push(center("Cuenta al corriente  ✓") + "\n");
  } else {
    lines.push(center(`Credito: ${fmt(Math.abs(r.remainingBalance))}`) + "\n");
  }

  lines.push(
    divider() + "\n",
    center("Gracias por su pago") + "\n",
    "\n\n\n\n",
    `${GS}V\x41\x03`,   // Partial cut
  );

  return lines;
}

// ── Print receipt ─────────────────────────────────────────────────────────────

export async function printReceipt(printerName: string, data: ReceiptData): Promise<void> {
  await connectQZ();
  const qz = window.qz;

  const config = qz.configs.create(printerName, { encoding: "Cp1252" });
  const lines = buildReceipt(data);

  await qz.print(config, lines.map((d) => ({ type: "raw", format: "plain", data: d })));
}
