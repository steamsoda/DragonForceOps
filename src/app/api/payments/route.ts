import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Pendiente: transaccion de registro de pago con asignaciones y bitacora de auditoria." },
    { status: 501 }
  );
}
