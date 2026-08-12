"use client";

import { archiveSportsSignupTournamentAction } from "@/server/actions/sports-signups";

export function FinalizeTournamentForm({
  tournamentId,
  tournamentName,
  returnTo,
}: {
  tournamentId: string;
  tournamentName: string;
  returnTo: string;
}) {
  return (
    <form
      action={archiveSportsSignupTournamentAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Finalizar ${tournamentName}? Se ocultara de la operacion actual y sus equipos quedaran archivados. Pagos, inscripciones, reportes y planteles historicos se conservaran.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <button
        type="submit"
        className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-950"
      >
        Finalizar
      </button>
    </form>
  );
}
