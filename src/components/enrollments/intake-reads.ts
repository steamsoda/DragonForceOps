"use client";

export async function readIntake<T>(params: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/director-readonly/intake?${new URLSearchParams(params)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("intake_read_failed");
  return response.json() as Promise<T>;
}
