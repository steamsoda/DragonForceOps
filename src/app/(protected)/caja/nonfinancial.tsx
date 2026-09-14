import Link from "next/link";
import { z } from "zod";
import { PageShell } from "@/components/ui/page-shell";
import { readManagementData, ManagementReadUnavailable } from "../dashboard/management-read";

export const cajaReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  players: z.array(z.object({ enrollmentId: z.string().uuid(), playerName: z.string(), campusName: z.string(), birthYear: z.number().int().nullable() }).strict()),
  products: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
}).strict();

export async function NonfinancialCaja({ filters }: { filters: Record<string, string | undefined> }) {
  const data = await readManagementData("director_readonly_caja_v1", filters, cajaReadSchema);
  if (!data) return <ManagementReadUnavailable title="Caja" />;
  const selected = data.players.find((player) => player.enrollmentId === filters.enrollmentId);
  return <PageShell title="Caja" subtitle="Solo lectura" wide>
    <form method="get" className="mb-4 flex flex-wrap gap-3">
      <select aria-label="Campus" name="campus" defaultValue={filters.campus ?? ""} className="rounded-md border p-2">
        <option value="">Todos los campus</option>{data.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input aria-label="Buscar jugador" name="q" defaultValue={filters.q ?? ""} placeholder="Buscar jugador" className="rounded-md border p-2" />
      <button type="submit" className="rounded-md border px-4 py-2">Buscar</button>
    </form>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2"><h2 className="font-semibold">Jugadores</h2>
        {data.players.map((p) => <Link key={p.enrollmentId} className="block border-b py-3 text-portoBlue" href={`/caja?${new URLSearchParams({ campus: filters.campus ?? "", q: filters.q ?? "", enrollmentId: p.enrollmentId })}`}>{p.playerName} | {p.campusName} | {p.birthYear ?? "-"}</Link>)}
        {!data.players.length && <p>Sin resultados.</p>}
      </section>
      <section className="space-y-3"><h2 className="font-semibold">{selected?.playerName ?? "Selecciona un jugador"}</h2>
        {selected && <><h3 className="text-sm font-medium">Productos</h3><ul>{data.products.map((p) => <li className="border-b py-2" key={p.id}>{p.name}</li>)}</ul></>}
      </section>
    </div>
  </PageShell>;
}
