"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type {
  PlayerRosterGroupRow,
  PlayerRosterGroupSection,
  PlayerRosterGroupsData,
  RosterTuitionCell,
} from "@/lib/queries/player-roster-groups";

const SECTION_ROW_HEIGHT = 58;
const PLAYER_ROW_HEIGHT = 40;
const EMPTY_ROW_HEIGHT = 44;
const OVERSCAN_ROWS = 8;

type VirtualRow =
  | {
      kind: "section";
      key: string;
      section: PlayerRosterGroupSection;
      top: number;
      height: number;
    }
  | {
      kind: "empty";
      key: string;
      section: PlayerRosterGroupSection;
      top: number;
      height: number;
    }
  | {
      kind: "player";
      key: string;
      row: PlayerRosterGroupRow;
      sectionId: string;
      index: number;
      top: number;
      height: number;
    };

function tuitionCellClass(state: RosterTuitionCell["state"]) {
  if (state === "pending") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (state === "platform") return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200";
  if (state === "paid") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
}

function groupedRosterHref({ campusId, gender, birthYear }: { campusId?: string; gender?: string; birthYear?: number | string | null }) {
  const params = new URLSearchParams({ view: "groups" });
  if (campusId) params.set("campus", campusId);
  if (gender) params.set("gender", gender);
  if (birthYear) params.set("year", String(birthYear));
  return `/players?${params.toString()}`;
}

function buildGridTemplate(monthCount: number) {
  return `48px 78px minmax(240px, 1.8fr) 70px minmax(130px, 1fr) 96px repeat(${monthCount}, 100px)`;
}

function buildVirtualRows(sections: PlayerRosterGroupSection[]) {
  const rows: VirtualRow[] = [];
  const sectionOffsets = new Map<string, number>();
  let top = 0;

  for (const section of sections) {
    sectionOffsets.set(section.id, top);
    rows.push({ kind: "section", key: `section-${section.id}`, section, top, height: SECTION_ROW_HEIGHT });
    top += SECTION_ROW_HEIGHT;

    if (section.rows.length === 0) {
      rows.push({ kind: "empty", key: `empty-${section.id}`, section, top, height: EMPTY_ROW_HEIGHT });
      top += EMPTY_ROW_HEIGHT;
      continue;
    }

    section.rows.forEach((row, index) => {
      rows.push({
        kind: "player",
        key: row.enrollmentId,
        row,
        sectionId: section.id,
        index,
        top,
        height: PLAYER_ROW_HEIGHT,
      });
      top += PLAYER_ROW_HEIGHT;
    });
  }

  return { rows, sectionOffsets, totalHeight: top };
}

function getVisibleRows(rows: VirtualRow[], scrollTop: number, viewportHeight: number) {
  const start = Math.max(0, scrollTop - OVERSCAN_ROWS * PLAYER_ROW_HEIGHT);
  const end = scrollTop + viewportHeight + OVERSCAN_ROWS * PLAYER_ROW_HEIGHT;
  return rows.filter((row) => row.top + row.height >= start && row.top <= end);
}

export function GroupedRosterClient({ data }: { data: PlayerRosterGroupsData | null }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 620 });

  const virtual = useMemo(() => buildVirtualRows(data?.sections ?? []), [data?.sections]);
  const visibleRows = useMemo(
    () => getVisibleRows(virtual.rows, viewport.scrollTop, viewport.height),
    [virtual.rows, viewport.scrollTop, viewport.height],
  );

  if (!data) {
    return (
      <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        No hay campus disponibles para esta vista.
      </div>
    );
  }

  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "male", label: "Varonil" },
    { value: "female", label: "Femenil" },
  ];
  const gridTemplateColumns = buildGridTemplate(data.months.length);

  function scrollToSection(sectionId: string) {
    const top = virtual.sectionOffsets.get(sectionId);
    if (top == null) return;
    viewportRef.current?.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Campus</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona un campus para mantener la vista ligera y facil de escanear.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {data.totalPlayers} jugadores
            </span>
            {data.unassignedCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {data.unassignedCount} sin grupo
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.campuses.map((campus) => {
            const active = campus.id === data.selectedCampusId;
            return (
              <Link
                key={campus.id}
                href={groupedRosterHref({ campusId: campus.id, gender: data.selectedGender, birthYear: data.selectedBirthYear })}
                prefetch={false}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-portoBlue bg-blue-50 text-portoBlue shadow-sm dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-sm font-semibold">{campus.name}</span>
                <span className="mt-1 block text-xs opacity-75">{active ? "Campus seleccionado" : "Ver roster del campus"}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Genero</p>
          <div className="flex flex-wrap gap-2">
            {genderOptions.map((option) => {
              const active = data.selectedGender === option.value;
              return (
                <Link
                  key={option.value || "all"}
                  href={groupedRosterHref({ campusId: data.selectedCampusId, gender: option.value, birthYear: data.selectedBirthYear })}
                  prefetch={false}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-portoBlue bg-portoBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Categoria</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender })}
              prefetch={false}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                data.selectedBirthYear == null
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              }`}
            >
              Todas
            </Link>
            {data.birthYears.map((year) => (
              <Link
                key={year}
                href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender, birthYear: year })}
                prefetch={false}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  data.selectedBirthYear === year
                    ? "border-portoBlue bg-portoBlue text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                }`}
              >
                {year}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-max gap-2">
          {data.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:text-slate-300"
            >
              {section.name} ({section.rows.length})
            </button>
          ))}
        </div>
      </div>

      <div
        ref={viewportRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          setViewport({ scrollTop: target.scrollTop, height: target.clientHeight });
        }}
        className="max-h-[calc(100vh-15rem)] min-h-[520px] overflow-auto rounded-md border border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="min-w-[920px]">
          <div
            className="sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50 text-left uppercase text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            style={{ gridTemplateColumns }}
          >
            <div className="px-2 py-2 text-center">#</div>
            <div className="px-2 py-2">ID</div>
            <div className="px-2 py-2">Nombre</div>
            <div className="px-2 py-2 text-center">CAT</div>
            <div className="px-2 py-2">Nivel/Grupo</div>
            <div className="px-2 py-2 text-center">INSC</div>
            {data.months.map((month) => (
              <div key={month.periodMonth} className="px-2 py-2 text-center">
                {month.label}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height: virtual.totalHeight }}>
            {visibleRows.map((item) => {
              if (item.kind === "section") {
                return (
                  <div
                    key={item.key}
                    className="absolute left-0 right-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
                    style={{ top: item.top, height: item.height }}
                  >
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{item.section.name}</h2>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.section.subtitle}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {item.section.rows.length} jugadores
                    </span>
                  </div>
                );
              }

              if (item.kind === "empty") {
                return (
                  <div
                    key={item.key}
                    className="absolute left-0 right-0 flex items-center border-b border-slate-100 px-3 text-slate-500 dark:border-slate-800 dark:text-slate-400"
                    style={{ top: item.top, height: item.height }}
                  >
                    Sin jugadores activos en este grupo.
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  className="absolute left-0 right-0 grid items-center border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  style={{ top: item.top, height: item.height, gridTemplateColumns }}
                >
                  <div className="px-2 text-center text-slate-500 dark:text-slate-400">{item.index + 1}</div>
                  <div className="px-2 font-mono text-slate-700 dark:text-slate-300">{item.row.publicPlayerId}</div>
                  <div className="min-w-0 px-2">
                    <Link href={`/players/${item.row.playerId}`} prefetch={false} className="block truncate font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                      {item.row.fullName}
                    </Link>
                  </div>
                  <div className="px-2 text-center text-slate-700 dark:text-slate-300">{item.row.birthYear ?? "-"}</div>
                  <div className="truncate px-2 text-slate-700 dark:text-slate-300">{item.row.levelGroup}</div>
                  <div className="px-2 text-center text-slate-700 dark:text-slate-300">{item.row.inscriptionDate}</div>
                  {item.row.tuition.map((cell) => (
                    <div key={cell.periodMonth} className="px-2 text-center">
                      <span className={`inline-flex min-h-6 min-w-20 items-center justify-center rounded border px-2 py-1 font-medium leading-none ${tuitionCellClass(cell.state)}`}>
                        {cell.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
