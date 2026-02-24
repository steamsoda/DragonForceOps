import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";

export default function UnauthorizedPage() {
  return (
    <PageShell title="Unauthorized" subtitle="Your account is authenticated but not assigned an app role">
      <div className="space-y-3 text-sm text-slate-700">
        <p>Ask an administrator to assign your role in `public.user_roles`.</p>
        <Link href="/login" className="inline-flex rounded-md border border-slate-300 px-3 py-2 hover:bg-slate-50">
          Back to login
        </Link>
      </div>
    </PageShell>
  );
}
