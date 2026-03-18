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

  const copyFooter = (label: string): string[] => {
    const copy: string[] = [
      divider("=") + "\n",
      `${ESC}E\x01`,
      row("TOTAL PAGADO", fmt(r.amount)) + "\n",
      `${ESC}E\x00`,
    ];
    if (r.remainingBalance > 0) {
      copy.push(row("Saldo pendiente", fmt(r.remainingBalance)) + "\n");
    } else if (r.remainingBalance === 0) {
      copy.push(center("Cuenta al corriente  ✓") + "\n");
    } else {
      copy.push(center(`Credito: ${fmt(Math.abs(r.remainingBalance))}`) + "\n");
    }
    copy.push(divider() + "\n", center("Gracias por su pago") + "\n", center(label) + "\n", "\n\n");
    return copy;
  };

  // Copy 1 — client
  lines.push(...copyFooter("-- COPIA CLIENTE --"));
  lines.push(`${GS}V\x41\x03`); // Partial cut

  // Copy 2 — academy (reprint full receipt)
  lines.push(
    `${ESC}@`,
    `${ESC}a\x01`,
    `${ESC}!\x10`,
    "INVICTA\n",
    `${ESC}!\x00`,
    "FC Porto Dragon Force\n",
    `${r.campusName}\n`,
    divider() + "\n",
    `${ESC}a\x00`,
    `Alumno: ${r.playerName}\n`,
    `Fecha:  ${r.date}\n`,
    `Hora:   ${r.time}\n`,
    `Metodo: ${r.method}\n`,
    `Folio:  ${shortId}\n`,
    divider() + "\n",
  );
  for (const c of r.chargesPaid) {
    lines.push(row(c.description, fmt(c.amount)) + "\n");
  }
  lines.push(...copyFooter("-- COPIA ACADEMIA --"));
  lines.push(`${GS}V\x00`); // Full cut

  return lines;
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

function buildCorte(c: CorteData): string[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: c.currency }).format(n);

  const now = new Date();
  const printedAt = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const lines: string[] = [
    `${ESC}@`,
    `${ESC}a\x01`,
    `${ESC}!\x10`,
    "INVICTA\n",
    `${ESC}!\x00`,
    "FC Porto Dragon Force\n",
    `${c.campusLabel}\n`,
    divider() + "\n",
    `${ESC}a\x00`,
    `CORTE DIARIO: ${c.date}\n`,
    `Impreso: ${printedAt}\n`,
    divider() + "\n",
    `${ESC}E\x01`,
    row("TOTAL COBRADO", fmt(c.totalCobrado)) + "\n",
    `${ESC}E\x00`,
    divider() + "\n",
  ];

  if (c.byMethod.length > 0) {
    lines.push("Por metodo de pago:\n");
    for (const m of c.byMethod) {
      lines.push(row(`${m.methodLabel} (${m.count})`, fmt(m.total)) + "\n");
    }
    lines.push(divider() + "\n");
  }

  if (c.byChargeType.length > 0) {
    lines.push("Por tipo de cargo:\n");
    for (const t of c.byChargeType) {
      lines.push(row(t.typeName, fmt(t.total)) + "\n");
    }
    lines.push(divider() + "\n");
  }

  if (c.payments.length > 0) {
    lines.push(`Detalle (${c.payments.length} cobros):\n`);
    for (const p of c.payments) {
      const time = new Date(p.paidAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
      lines.push(`${time} ${p.methodLabel.slice(0, 4).padEnd(4)} ${fmt(p.amount).padStart(10)} ${p.playerName.slice(0, 18)}\n`);
    }
    lines.push(divider() + "\n");
  }

  lines.push(center("-- fin del corte --") + "\n", "\n\n\n", `${GS}V\x00`);
  return lines;
}

// ── Print receipt ─────────────────────────────────────────────────────────────

async function sendToQZ(printerName: string, lines: string[]): Promise<void> {
  await connectQZ();
  const qz = window.qz;
  const config = qz.configs.create(printerName, { encoding: "Cp1252" });
  await qz.print(config, lines.map((d) => ({ type: "raw", format: "plain", data: d })));
}

export async function printReceipt(printerName: string, data: ReceiptData): Promise<void> {
  await sendToQZ(printerName, buildReceipt(data));
}

export async function printCorte(printerName: string, data: CorteData): Promise<void> {
  await sendToQZ(printerName, buildCorte(data));
}
