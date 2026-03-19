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
    // Signed mode — no dialog, permanent trust via Site Manager cert
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
    // Unsigned fallback — QZ Tray will prompt (set Advanced → Allow all)
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(""));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((_toSign: string) => (resolve: (sig: string) => void) => resolve(""));
  }

  await qz.websocket.connect({ retries: 3, delay: 1 });
}

// ── Item types ────────────────────────────────────────────────────────────────

type QZDataItem =
  | { type: "raw"; format: "plain"; data: string }
  | { type: "raw"; format: "image"; data: string; options: { language: "ESCPOS"; dotDensity: string } };

function t(data: string): QZDataItem {
  return { type: "raw", format: "plain", data };
}

function logoItem(dataUrl: string): QZDataItem {
  return { type: "raw", format: "image", data: dataUrl, options: { language: "ESCPOS", dotDensity: "double" } };
}

// ── Logo loader (cached after first fetch) ────────────────────────────────────

let cachedLogo: string | null | undefined;

async function fetchLogoDataUrl(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const res = await fetch("/logos-porto-recibo.png");
    if (!res.ok) { cachedLogo = null; return null; }
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}

// ── ESC/POS helpers ───────────────────────────────────────────────────────────

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

function buildReceiptHeader(campusName: string, logoDataUrl: string | null): QZDataItem[] {
  const items: QZDataItem[] = [t(`${ESC}@`), t(`${ESC}a\x01`)]; // init + center

  if (logoDataUrl) {
    items.push(logoItem(logoDataUrl));
    items.push(t(`\n${campusName}\n`));
  } else {
    items.push(
      t(`${ESC}!\x10`),
      t("INVICTA\n"),
      t(`${ESC}!\x00`),
      t("FC Porto Dragon Force\n"),
      t(`${campusName}\n`),
    );
  }
  return items;
}

function buildReceipt(r: ReceiptData, logoDataUrl: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency }).format(n);
  const shortId = r.paymentId.slice(-8).toUpperCase();

  const header = buildReceiptHeader(r.campusName, logoDataUrl);

  const meta: QZDataItem[] = [
    t(divider() + "\n"),
    t(`${ESC}a\x00`), // left align
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
    items.push(t(divider() + "\n"), t(center("Gracias por su pago") + "\n"), t(center(label) + "\n"), t("\n\n"));
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

function buildCorte(c: CorteData, logoDataUrl: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: c.currency }).format(n);

  const now = new Date();
  const printedAt = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const header = buildReceiptHeader(c.campusLabel, logoDataUrl);

  const items: QZDataItem[] = [
    ...header,
    t(divider() + "\n"),
    t(`${ESC}a\x00`), // left align
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
      const time = new Date(p.paidAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
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
  const logo = await fetchLogoDataUrl();
  await sendToQZ(printerName, buildReceipt(data, logo));
}

export async function printCorte(printerName: string, data: CorteData): Promise<void> {
  const logo = await fetchLogoDataUrl();
  await sendToQZ(printerName, buildCorte(data, logo));
}
