import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "TBD: daily corte report query endpoint." }, { status: 501 });
}
