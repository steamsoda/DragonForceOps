import { createClient } from "@/lib/supabase/server";

export type PortoDatosGenerales = {
  periodFirstDay: string;
  periodLastDay: string;
  nuevasInscripciones: { total: number; varonil: number; femenil: number };
  retiros: { total: number; reasons: { reason: string; count: number }[] };
  activos: { total: number; varonil: number; femenil: number; becados: number };
  deudores: { count: number; pendienteMxn: number };
};

export async function getPortoDatosGenerales(
  month: string // "YYYY-MM"
): Promise<PortoDatosGenerales | null> {
  const supabase = await createClient();
  const firstDay = `${month}-01`;

  const { data, error } = await supabase.rpc("get_porto_datos_generales", {
    p_month: firstDay
  });

  if (error || !data) return null;

  const d = data as Record<string, unknown>;

  function obj(key: string) {
    return d[key] as Record<string, unknown>;
  }

  return {
    periodFirstDay: d.period_first_day as string,
    periodLastDay: d.period_last_day as string,
    nuevasInscripciones: {
      total: obj("nuevas_inscripciones").total as number,
      varonil: obj("nuevas_inscripciones").varonil as number,
      femenil: obj("nuevas_inscripciones").femenil as number
    },
    retiros: {
      total: obj("retiros").total as number,
      reasons: obj("retiros").reasons as { reason: string; count: number }[]
    },
    activos: {
      total: obj("activos").total as number,
      varonil: obj("activos").varonil as number,
      femenil: obj("activos").femenil as number,
      becados: obj("activos").becados as number
    },
    deudores: {
      count: obj("deudores").count as number,
      pendienteMxn: obj("deudores").pendiente_mxn as number
    }
  };
}
