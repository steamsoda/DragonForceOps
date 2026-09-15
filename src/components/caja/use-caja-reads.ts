"use client";

import { useMemo } from "react";
import { useDirectorReadOnly } from "@/components/auth/read-only-controls";
import * as actions from "@/server/actions/caja";

export function useCajaReads(onError: (message: string) => void) {
  const readOnly = useDirectorReadOnly();
  return useMemo(() => {
    async function read<T>(params: Record<string, string>, fallback: T): Promise<T> {
      try {
        const response = await fetch(`/api/director-readonly/caja?${new URLSearchParams(params)}`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error("read_failed");
        return await response.json() as T;
      } catch {
        onError("No se pudo cargar Caja. Intenta nuevamente.");
        return fallback;
      }
    }
    return {
      meta: () => readOnly ? read<actions.CajaDrilldownMeta>({ mode: "meta" }, { campuses: [], birthYearsByCampus: {} }) : actions.getCajaDrilldownMetaAction(),
      search: (q: string) => readOnly ? read<actions.CajaPlayerResult[]>({ mode: "search", q }, []) : actions.searchPlayersForCajaAction(q),
      year: (campus: string, year: number) => readOnly ? read<actions.CajaPlayerResult[]>({ mode: "year", campus, year: String(year) }, []) : actions.listCajaPlayersByCampusYearAction(campus, year),
      account: (enrollmentId: string) => readOnly ? read<actions.CajaEnrollmentData | null>({ mode: "account", enrollmentId }, null) : actions.getEnrollmentForCajaAction(enrollmentId),
      products: (enrollmentId: string, full = false) => readOnly ? read<actions.CajaProductCategory[]>({ mode: "products", enrollmentId, full: String(full) }, []) : actions.getProductsForCajaAction(enrollmentId, full),
      fullCatalog: () => readOnly ? Promise.resolve(true) : actions.getCajaCatalogExceptionAccessAction(),
    };
  }, [readOnly, onError]);
}
