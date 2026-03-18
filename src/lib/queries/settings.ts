import { createClient } from "@/lib/supabase/server";

export type TagSettings = {
  payment: boolean;
  teamType: boolean;
  goalkeeper: boolean;
  uniform: boolean;
};

const TAG_KEYS = ["tag_payment", "tag_team_type", "tag_goalkeeper", "tag_uniform"] as const;

export async function getTagSettings(): Promise<TagSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", TAG_KEYS as unknown as string[]);

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));

  return {
    payment:    map.get("tag_payment")    !== false,
    teamType:   map.get("tag_team_type")  !== false,
    goalkeeper: map.get("tag_goalkeeper") !== false,
    uniform:    map.get("tag_uniform")    === true,
  };
}

export type AllSettings = {
  tags: TagSettings;
  printerName: string;
};

const PRINTER_DEFAULT = "EPSON TM-T20IV";

export async function getAllSettings(): Promise<AllSettings> {
  const supabase = await createClient();
  const [tags, { data: printerRow }] = await Promise.all([
    getTagSettings(),
    supabase.from("app_settings").select("value").eq("key", "printer_name").maybeSingle(),
  ]);
  const printerName = (printerRow?.value as string | null) ?? PRINTER_DEFAULT;
  return { tags, printerName };
}

export async function getPrinterName(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "printer_name").maybeSingle();
  return (data?.value as string | null) ?? PRINTER_DEFAULT;
}
