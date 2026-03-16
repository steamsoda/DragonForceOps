export default function MaintenancePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="rounded-full bg-portoBlue px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
        Aplicacion interna
      </p>
      <h1 className="text-3xl font-bold text-portoDark">FC Porto Dragon Force Monterrey</h1>
      <p className="text-slate-700 dark:text-slate-300">
        La plataforma de operaciones se encuentra en mantenimiento mientras publicamos la nueva version.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-400">Gracias por tu paciencia.</p>
    </main>
  );
}
