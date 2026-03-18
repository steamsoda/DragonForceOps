import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Pendiente: endpoint de consulta para reporte de corte diario." }, { status: 501 });
}
