import { redirect } from "next/navigation";
import { requireSuperAdminContext } from "@/lib/auth/permissions";

type SearchParams = Promise<{
  campus?: string;
  enrollment?: string;
  ok?: string;
  err?: string;
  payment?: string;
}>;

export default async function LegacyContryRegularizationRedirect({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperAdminContext("/unauthorized");
  const params = await searchParams;
  const nextParams = new URLSearchParams();

  if (params.campus?.trim()) nextParams.set("campus", params.campus.trim());
  if (params.enrollment?.trim()) nextParams.set("enrollment", params.enrollment.trim());
  if (params.ok?.trim()) nextParams.set("ok", params.ok.trim());
  if (params.err?.trim()) nextParams.set("err", params.err.trim());
  if (params.payment?.trim()) nextParams.set("payment", params.payment.trim());

  const queryString = nextParams.toString();
  redirect(`/admin/regularizacion-historica${queryString ? `?${queryString}` : ""}`);
}
