import { redirect } from "next/navigation";
import { getMonterreyMonthString } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  month?: string;
}>;

function getMonthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0));
  const endDate = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;

  return {
    start: `${match[1]}-${match[2]}-01`,
    end: endDate,
  };
}

export default async function DashboardNewEnrollmentsRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const month = params.month ?? getMonterreyMonthString();
  const range = getMonthRange(month);
  const qs = new URLSearchParams();

  if (params.campus) qs.set("campus", params.campus);
  if (range) {
    qs.set("start", range.start);
    qs.set("end", range.end);
  }

  redirect(`/new-enrollments${qs.toString() ? `?${qs.toString()}` : ""}`);
}
