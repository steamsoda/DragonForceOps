import { NextResponse } from "next/server";
import { buildProductChargeLedgerWorkbook } from "@/lib/exports/product-charge-ledger-workbook";
import { getProductChargeLedgerExportData } from "@/lib/queries/products";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyDayBounds, parseDateOnlyInput } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function exportDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ message: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId")?.trim() ?? "";
  const format = searchParams.get("format") === "json" ? "json" : "xlsx";
  const rawFrom = searchParams.get("paidFrom")?.trim() ?? "";
  const rawTo = searchParams.get("paidTo")?.trim() ?? "";
  const paidFrom = rawFrom ? parseDateOnlyInput(rawFrom) : null;
  const paidTo = rawTo ? parseDateOnlyInput(rawTo) : null;

  if (!productId || (rawFrom && !paidFrom) || (rawTo && !paidTo) || (paidFrom && paidTo && paidFrom > paidTo)) {
    return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });
  }

  try {
    const data = await getProductChargeLedgerExportData({
      productId,
      paidFrom,
      paidTo,
      paidFromTimestamp: paidFrom ? getMonterreyDayBounds(paidFrom).start : null,
      paidToTimestamp: paidTo ? getMonterreyDayBounds(paidTo).end : null,
    });
    if (!data) return NextResponse.json({ message: "Sin permisos o producto inexistente." }, { status: 403 });

    const baseFilename = `cargos-${slugify(data.productName)}-${exportDate()}`;
    if (format === "json") {
      return NextResponse.json({ data, filename: `${baseFilename}.png` }, { headers: { "Cache-Control": "no-store" } });
    }

    const workbook = await buildProductChargeLedgerWorkbook(data);
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (exportError) {
    console.error("product charge ledger export failed", exportError);
    return NextResponse.json({ message: "No se pudo generar el archivo." }, { status: 500 });
  }
}
