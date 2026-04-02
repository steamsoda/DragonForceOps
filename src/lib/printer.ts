"use client";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz: any;
  }
}

let loadPromise: Promise<void> | null = null;

function loadQZScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined") return Promise.reject(new Error("Server-side"));
  if (window.qz) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/qz-tray.js";
    script.onload = () => (window.qz ? resolve() : reject(new Error("QZ loaded but window.qz missing")));
    script.onerror = () => reject(new Error("Could not load /qz-tray.js - make sure the file is in /public"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

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
        })
          .then((res) => {
            if (!res.ok) return res.text().then((text) => reject(new Error(text)));
            return res.text().then(resolve);
          })
          .catch(reject);
      }
    );
  } else {
    qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(""));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((_toSign: string) => (resolve: (sig: string) => void) => resolve(""));
  }

  await qz.websocket.connect({ retries: 3, delay: 1 });
}

type QZDataItem =
  | { type: "raw"; format: "plain"; data: string }
  | { type: "raw"; format: "base64"; data: string };

function normalizePrinterText(str: string): string {
  return str
    .normalize("NFC")
    .replaceAll("Ã¡", "á")
    .replaceAll("Ã©", "é")
    .replaceAll("Ã­", "í")
    .replaceAll("Ã³", "ó")
    .replaceAll("Ãº", "ú")
    .replaceAll("Ã", "Á")
    .replaceAll("Ã‰", "É")
    .replaceAll("Ã", "Í")
    .replaceAll("Ã“", "Ó")
    .replaceAll("Ãš", "Ú")
    .replaceAll("Ã±", "ñ")
    .replaceAll("Ã‘", "Ñ")
    .replaceAll("Ã¼", "ü")
    .replaceAll("Ãœ", "Ü")
    .replaceAll("â€¦", "...")
    .replaceAll("â€”", "-")
    .replaceAll("â€“", "-")
    .replaceAll("â€¢", "-")
    .replaceAll("âœ“", "OK")
    .replaceAll("Â·", "·")
    .replaceAll("\u00a0", " ");
}

function encodeCP1252Base64(str: string): string {
  const normalized = normalizePrinterText(str);
  let binary = "";
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    binary += String.fromCharCode(code <= 0xff ? code : 0x3f);
  }
  return btoa(binary);
}

function t(data: string): QZDataItem {
  return { type: "raw", format: "base64", data: encodeCP1252Base64(data) };
}

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

    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const width = Math.floor(img.naturalWidth * scale);
    const height = Math.floor(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const { data: pixels } = ctx.getImageData(0, 0, width, height);
    const bytesPerRow = Math.ceil(width / 8);
    const bitmap = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const gray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (gray < 128) {
          bitmap[y * bytesPerRow + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
        }
      }
    }

    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    const header = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);

    const combined = new Uint8Array(header.length + bitmap.length);
    combined.set(header);
    combined.set(bitmap, header.length);

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

let cachedLogoESCPOS: string | null | undefined;

async function fetchLogoESCPOS(): Promise<string | null> {
  if (cachedLogoESCPOS !== undefined) return cachedLogoESCPOS;
  cachedLogoESCPOS = await imageUrlToESCPOS("/logos-porto-recibo.png", 384);
  return cachedLogoESCPOS;
}

const ESC = "\x1B";
const GS = "\x1D";

function center(text: string, width = 42): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
}

function row(left: string, right: string, width = 42): string {
  const maxLeft = width - right.length - 1;
  const shortened = left.length > maxLeft ? `${left.slice(0, Math.max(0, maxLeft - 3))}...` : left;
  return shortened + " ".repeat(Math.max(0, width - shortened.length - right.length)) + right;
}

function divider(char = "-", width = 42): string {
  return char.repeat(width);
}

export type ReceiptData = {
  playerName: string;
  campusName: string;
  birthYear: number | null;
  method: string;
  amount: number;
  currency: string;
  remainingBalance: number;
  chargesPaid: { description: string; amount: number }[];
  paymentId: string;
  folio: string | null;
  date: string;
  time: string;
  splitPayment?: { amount: number; method: string };
};

function buildReceiptHeader(campusName: string, logoESCPOS: string | null): QZDataItem[] {
  const items: QZDataItem[] = [t(`${ESC}@`)];

  if (logoESCPOS) {
    items.push(t("\n"));
    items.push(t(`${ESC}a\x01`));
    items.push({ type: "raw", format: "base64", data: logoESCPOS });
    items.push(t("\n"));
    items.push(t(`${campusName}\n`));
    items.push(t("\n"));
    items.push(t(`${ESC}a\x00`));
  } else {
    items.push(
      t(`${ESC}a\x01`),
      t(`${ESC}!\x10`),
      t("INVICTA\n"),
      t(`${ESC}!\x00`),
      t("FC Porto Dragon Force\n"),
      t(`${campusName}\n`),
      t(`${ESC}a\x00`)
    );
  }

  return items;
}

function buildReceipt(receipt: ReceiptData, logoESCPOS: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: receipt.currency }).format(n);
  const shortId = receipt.folio ?? receipt.paymentId.slice(-8).toUpperCase();

  const header = buildReceiptHeader(receipt.campusName, logoESCPOS);
  const methodLines: QZDataItem[] = receipt.splitPayment
    ? [
        t(row(`Pago 1 (${receipt.method})`, fmt(receipt.amount - receipt.splitPayment.amount)) + "\n"),
        t(row(`Pago 2 (${receipt.splitPayment.method})`, fmt(receipt.splitPayment.amount)) + "\n"),
      ]
    : [t(`Metodo: ${receipt.method}\n`)];

  const meta: QZDataItem[] = [
    t(divider() + "\n"),
    t(`Alumno: ${receipt.playerName}\n`),
    ...(receipt.birthYear != null ? [t(`Categ.: ${receipt.birthYear}\n`)] : []),
    t(`Fecha:  ${receipt.date}\n`),
    t(`Hora:   ${receipt.time}\n`),
    ...methodLines,
    t(`Folio:  ${shortId}\n`),
    t(divider() + "\n"),
  ];

  const chargeLines = receipt.chargesPaid.map((charge) => t(row(charge.description, fmt(charge.amount)) + "\n"));

  function footer(label: string): QZDataItem[] {
    const items: QZDataItem[] = [
      t(divider("=") + "\n"),
      t(`${ESC}E\x01`),
      t(row("TOTAL PAGADO", fmt(receipt.amount)) + "\n"),
      t(`${ESC}E\x00`),
    ];

    if (receipt.remainingBalance > 0) {
      items.push(t(row("Saldo pendiente", fmt(receipt.remainingBalance)) + "\n"));
    } else if (receipt.remainingBalance === 0) {
      items.push(t(center("Cuenta al corriente OK") + "\n"));
    } else {
      items.push(t(center(`Credito: ${fmt(Math.abs(receipt.remainingBalance))}`) + "\n"));
    }

    items.push(
      t(divider() + "\n"),
      t(center("Gracias por su pago") + "\n"),
      t(center(label) + "\n"),
      t("\n\n\n\n")
    );

    return items;
  }

  return [
    ...header,
    ...meta,
    ...chargeLines,
    ...footer("-- COPIA CLIENTE --"),
    t(`${GS}V\x41\x03`),
    ...header,
    ...meta,
    ...chargeLines,
    ...footer("-- COPIA ACADEMIA --"),
    t(`${GS}V\x00`),
  ];
}

export type CorteData = {
  campusLabel: string;
  openedAt: string;
  closedAt: string;
  totalCobrado: number;
  currency: string;
  byMethod: { methodLabel: string; count: number; total: number }[];
  byChargeType: { typeName: string; total: number }[];
  productDetails: { description: string; total: number }[];
  payments: { playerName: string; amount: number; methodLabel: string; paidAt: string }[];
};

function buildCorte(corte: CorteData, logoESCPOS: string | null): QZDataItem[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: corte.currency }).format(n);

  const printedAt = new Date().toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
  const openedAt = new Date(corte.openedAt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
  const closedAt = new Date(corte.closedAt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });

  const items: QZDataItem[] = [
    ...buildReceiptHeader(corte.campusLabel, logoESCPOS),
    t(divider() + "\n"),
    t("CORTE DIARIO\n"),
    t(`Desde: ${openedAt}\n`),
    t(`Hasta: ${closedAt}\n`),
    t(`Impreso: ${printedAt}\n`),
    t(divider() + "\n"),
    t(`${ESC}E\x01`),
    t(row("TOTAL CONTADO", fmt(corte.totalCobrado)) + "\n"),
    t(`${ESC}E\x00`),
    t(divider() + "\n"),
  ];

  if (corte.byMethod.length > 0) {
    items.push(t("Por metodo de pago:\n"));
    for (const method of corte.byMethod) {
      items.push(t(row(`${method.methodLabel} (${method.count})`, fmt(method.total)) + "\n"));
    }
    items.push(t(divider() + "\n"));
  }

  if (corte.byChargeType.length > 0) {
    items.push(t("Por tipo de cargo:\n"));
    for (const rowData of corte.byChargeType) {
      items.push(t(row(rowData.typeName, fmt(rowData.total)) + "\n"));
    }
    items.push(t(divider() + "\n"));
  }

  if (corte.productDetails.length > 0) {
    items.push(t("Productos vendidos:\n"));
    for (const product of corte.productDetails) {
      items.push(t(row(product.description, fmt(product.total)) + "\n"));
    }
    items.push(t(divider() + "\n"));
  }

  if (corte.payments.length > 0) {
    items.push(t(`Detalle (${corte.payments.length} cobros):\n`));
    for (const payment of corte.payments) {
      const time = new Date(payment.paidAt).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Monterrey",
      });
      items.push(
        t(`${time} ${payment.methodLabel.slice(0, 4).padEnd(4)} ${fmt(payment.amount).padStart(10)} ${payment.playerName.slice(0, 18)}\n`)
      );
    }
    items.push(t(divider() + "\n"));
  }

  items.push(t(center("-- fin del corte --") + "\n"), t("\n\n\n"), t(`${GS}V\x00`));
  return items;
}

async function sendToQZ(printerName: string, items: QZDataItem[]): Promise<void> {
  await connectQZ();
  const qz = window.qz;
  const config = qz.configs.create(printerName, { encoding: "Cp1252" });
  await qz.print(config, items);
}

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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
