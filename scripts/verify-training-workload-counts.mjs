import { readFile } from "node:fs/promises";
import pg from "pg";

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

const localEnv = parseEnv(await readFile(".env.local", "utf8"));
const rawConnectionString = process.env.SUPABASE_PREVIEW_DB_URL ?? localEnv.SUPABASE_PREVIEW_DB_URL;
if (!rawConnectionString) throw new Error("SUPABASE_PREVIEW_DB_URL is required. This diagnostic is preview-only.");

const connectionUrl = new URL(rawConnectionString);
connectionUrl.searchParams.delete("sslmode");

const client = new pg.Client({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const campuses = await client.query("select id, name from public.campuses order by name");
  let checkedSessions = 0;

  for (const campus of campuses.rows) {
    const result = await client.query(
      `with rpc_rows as (
         select * from public.get_training_workload_30d($1::uuid, now())
       ),
       direct_counts as (
         select
           rpc.session_id,
           case when rpc.session_status = 'completed'
             then count(records.id) filter (where records.status = 'present')
             else 0
           end::bigint as attended_count,
           case when rpc.session_status = 'completed'
             then count(records.id)
             else 0
           end::bigint as roster_count
         from rpc_rows rpc
         left join public.attendance_records records on records.session_id = rpc.session_id
         group by rpc.session_id, rpc.session_status
       )
       select
         count(*)::int as checked_sessions,
         count(*) filter (
           where rpc.official_attended_count <> direct.attended_count
              or rpc.official_roster_count <> direct.roster_count
         )::int as mismatch_count
       from rpc_rows rpc
       join direct_counts direct on direct.session_id = rpc.session_id`,
      [campus.id],
    );

    const checked = Number(result.rows[0]?.checked_sessions ?? 0);
    const mismatches = Number(result.rows[0]?.mismatch_count ?? 0);
    checkedSessions += checked;
    if (mismatches > 0) throw new Error(`${campus.name}: ${mismatches} workload count mismatch(es) across ${checked} sessions.`);
    console.log(`${campus.name}: ${checked} sessions match direct attendance-record counts.`);
  }

  console.log(`Training workload count verification passed for ${checkedSessions} preview sessions.`);
} finally {
  await client.end();
}
