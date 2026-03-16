import { CajaClient } from "@/components/caja/caja-client";

export const metadata = { title: "Caja — Dragon Force Ops" };

export default function CajaPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-portoDark">Caja</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Búsqueda rápida y registro de pagos</p>
        </div>
        <CajaClient />
      </div>
    </main>
  );
}
