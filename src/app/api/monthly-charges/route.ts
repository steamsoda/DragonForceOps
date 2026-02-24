import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "TBD: monthly charge generation job endpoint." },
    { status: 501 }
  );
}
