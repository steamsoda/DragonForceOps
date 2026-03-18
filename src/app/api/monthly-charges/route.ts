import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Pendiente: endpoint del proceso de generacion de cargos mensuales." },
    { status: 501 }
  );
}
