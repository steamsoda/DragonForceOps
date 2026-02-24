import { redirect } from "next/navigation";
import { AzureSignInButton } from "@/components/auth/azure-sign-in-button";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <PageShell title="Login" subtitle="FC Porto Dragon Force Monterrey internal app">
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          Access is restricted to authorized staff. Use your Microsoft 365 account to continue.
        </p>
        <AzureSignInButton />
      </div>
    </PageShell>
  );
}
