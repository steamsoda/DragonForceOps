"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  searchReturningPlayersForIntakeAction,
  type ReturningPlayerSearchResult,
} from "@/server/actions/intake";
import { formatDateOnlyDdMmYyyy } from "@/lib/time";

const statusLabels: Record<string, string> = {
  active: "Inscripcion activa",
  ended: "Baja",
  cancelled: "Cancelada",
};

export function ReturningPlayerLookup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReturningPlayerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2 || isSearching) return;

    setIsSearching(true);
    setSearchError(false);
    try {
      const nextResults = await searchReturningPlayersForIntakeAction(trimmed);
      setResults(nextResults);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
      setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase text-emerald-700">Reingreso</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Buscar expediente anterior</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Busca primero al jugador para conservar sus tutores, historial y cuenta anterior. Puedes usar nombre, ID,
          nombre del tutor o telefono.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Jugador o tutor</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre, DF-0000 o telefono"
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
          />
        </label>
        <button
          type="submit"
          disabled={query.trim().length < 2 || isSearching}
          className="self-end rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSearching ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {searchError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          No se pudo completar la busqueda. Intenta nuevamente.
        </div>
      ) : null}

      {searched && !searchError ? (
        results.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {results.length} coincidencia{results.length === 1 ? "" : "s"}
            </p>
            {results.map((player) => (
              <article
                key={player.playerId}
                className="flex flex-col gap-3 rounded-md border border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{player.fullName}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {player.publicPlayerId ?? "Sin ID"} | Nac. {formatDateOnlyDdMmYyyy(player.birthDate)} | {player.campusLabel}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {statusLabels[player.lastEnrollmentStatus] ?? player.lastEnrollmentStatus} | Ultimo movimiento: {formatDateOnlyDdMmYyyy(player.lastEnrollmentDate)}
                  </p>
                </div>
                {player.hasActiveEnrollment ? (
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                      Ya tiene inscripcion activa
                    </span>
                    <Link
                      href={`/players/${player.playerId}`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Abrir jugador
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={`/players/${player.playerId}/enrollments/new?returning=1`}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Reinscribir este jugador
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            No encontramos un expediente anterior con esa busqueda.
          </div>
        )
      ) : null}

      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-900 dark:text-white">El jugador estuvo hace anos y no aparece?</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Captura un reingreso manual. Invicta creara su primer expediente digital y aplicara las opciones de precio de
          reingreso, sin inventar historial o credito anterior.
        </p>
        <Link
          href="/players/new?returning=1&manual=1"
          className="mt-3 inline-flex rounded-md border border-portoBlue px-3 py-2 text-sm font-medium text-portoBlue hover:bg-blue-50"
        >
          No aparece en Invicta - Capturar manualmente
        </Link>
      </div>
    </section>
  );
}
