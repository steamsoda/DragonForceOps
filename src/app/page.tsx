import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold text-portoDark">FC Porto Dragon Force Monterrey</h1>
      <p className="max-w-2xl text-slate-700">
        Internal operations MVP scaffold is ready. Continue from dashboard to build Phase 1 modules.
      </p>
      <div>
        <Link
          href="/dashboard"
          className="inline-flex rounded-md bg-portoBlue px-4 py-2 font-medium text-white hover:bg-portoDark"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
