import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "TBD: post payment transaction with allocations and audit log." },
    { status: 501 }
  );
}
