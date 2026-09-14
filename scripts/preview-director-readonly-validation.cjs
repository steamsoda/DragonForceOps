// Parent-review gate: do not run setup/revoke/recovery/cleanup without explicit approval.
// Synthetic Preview identity only; no emails, migration apply, or academy mutations.
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");
const { createServerClient } = require("@supabase/ssr");

const REF = "eqefgwdsqabnmpnbpqbq";
const MIGRATION = "20260914160000";
const PURPOSE = "temporary_director_readonly_preview_validation_v1";
const HOSTED = "https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app";
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, ".tmp");
const STATE = path.join(DIR, "director-readonly-validation.json");
const BROWSER = path.join(DIR, "director-readonly-browser-state.json");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = ["--setup", "--http", "--revoke", "--cleanup", "--browser-state", "--recovery"];
const PAGES = ["/inicio", "/players", "/caja", "/dashboard", "/new-enrollments", "/datos-faltantes", "/trial-classes", "/uniforms", "/attendance", "/attendance/groups", "/attendance/calendar", "/attendance/schedules", "/attendance/reports", "/reports/asistencia-coaches", "/reports/frecuencia-semanal", "/reports/carga-entrenamiento", "/teams", "/tournaments", "/sports-signups", "/convocatorias", "/nutrition", "/nutrition/measurements"];
const DETAIL = /^\/(players|teams|tournaments|convocatorias|attendance\/sessions|nutrition\/players)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/report)?$/i;
const FORBIDDEN_KEYS = new Set(["amount", "price", "unit_price", "balance", "pendingBalance", "payments", "charges", "paymentId", "chargeId", "folio", "notes", "note", "followUpNotes", "collectionNotes", "createdByEmail"]);
class ValidationError extends Error {}
function check(ok, code) { if (!ok) throw new ValidationError(code); }
function targetOrigin(value) {
  const url = new URL(value);
  check(!url.username && !url.password && url.pathname === "/" && !url.search && !url.hash, "target_must_be_origin");
  check(url.origin === HOSTED || (url.protocol === "http:" && url.hostname === "localhost" && (!url.port || Number(url.port) >= 1024)), "target_not_allowlisted");
  return url.origin;
}
function args(argv) {
  check(argv.filter((a) => MODES.includes(a)).length === 1, "choose_one_mode");
  const mode = argv.find((a) => MODES.includes(a));
  let target;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === mode) continue;
    check(argv[i] === "--target" && !target && argv[i + 1], "unexpected_argument");
    target = targetOrigin(argv[++i]);
  }
  if (["--setup", "--http", "--revoke", "--browser-state", "--recovery"].includes(mode)) check(target, "target_required");
  return { mode, target };
}
function safeFiles() {
  if (fs.existsSync(DIR)) check(!fs.lstatSync(DIR).isSymbolicLink() && fs.realpathSync(DIR) === DIR, "unsafe_temp_directory");
  for (const file of [STATE, BROWSER]) {
    check(path.dirname(file) === DIR, "unsafe_state_path");
    if (fs.existsSync(file)) check(!fs.lstatSync(file).isSymbolicLink() && fs.lstatSync(file).isFile(), "unsafe_state_file");
    execFileSync("git", ["check-ignore", "--quiet", file], { cwd: ROOT, stdio: "ignore" });
  }
}
function save(state) { safeFiles(); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state), { mode: 0o600 }); }
function load() {
  safeFiles();
  const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
  check(state.purpose === PURPOSE && state.ref === REF && UUID.test(state.runId) && UUID.test(state.userId), "invalid_fixture_state");
  check(state.email === `director-readonly-validation-${state.runId}@example.invalid`, "invalid_fixture_email");
  check(!state.roleRowId || UUID.test(state.roleRowId), "invalid_fixture_role");
  return state;
}
function checkPayload(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) { check(!FORBIDDEN_KEYS.has(key), "nonfinancial_payload_violation"); checkPayload(child); }
}
function checkPageBody(body) {
  const decoded = body.replaceAll('\\"', '"');
  check(!decoded.includes("La consulta no financiera de esta seccion aun no esta disponible") &&
    !/"digest"\s*:\s*"[^"]+"/.test(decoded) && !/(?:^|\n)[0-9a-f]+:E\{/.test(decoded) &&
    !decoded.includes("NEXT_REDIRECT") && !decoded.includes("NEXT_HTTP_ERROR_FALLBACK") &&
    !decoded.includes("Application error: a server-side exception"), "page_unavailable_or_server_error");
}
function sampleDetails(details) {
  const groups = new Map();
  for (const route of [...details].sort()) {
    const match = DETAIL.exec(route); if (!match) continue;
    const resource = match[1] + (match[2] || "");
    const rows = groups.get(resource) || [];
    if (rows.length < 3) rows.push(route);
    groups.set(resource, rows);
  }
  return groups;
}
function safeRouteLabel(route) {
  const pathname = new URL(route, "http://localhost").pathname;
  if (PAGES.includes(pathname) || ["/", "/login", "/unauthorized"].includes(pathname)) return pathname;
  const match = DETAIL.exec(pathname);
  return match ? `/${match[1]}/:uuid${match[2] || ""}` : "unreviewed-path";
}
function responseSummary(response, route, origin) {
  const rawType = response.headers.get("content-type") || "";
  const mime = rawType.split(";", 1)[0].trim().toLowerCase();
  const contentType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) ? mime : "missing-or-invalid";
  let redirect = "none";
  const location = response.headers.get("location");
  if (location) {
    try { const url = new URL(location, origin); redirect = url.origin === origin ? `${safeRouteLabel(url.pathname)};rsc=${url.searchParams.has("_rsc") ? "present" : "absent"}` : "cross-origin-suppressed"; }
    catch { redirect = "invalid-location"; }
  }
  return JSON.stringify({ route: safeRouteLabel(route), status: response.status, contentType, redirect });
}
function rscProbeRoute(route) {
  const url = new URL(route, "http://localhost");
  // Installed Next validates this cache key even when all router headers are absent.
  url.searchParams.set("_rsc", "");
  return `${url.pathname}${url.search}`;
}
async function discoverTeamDetails(client, details) {
  if ([...details].some((route) => DETAIL.exec(route)?.[1] === "teams")) return "html_links";
  const result = await client.from("v_director_readonly_teams").select("id").order("id").limit(3);
  check(!result.error && Array.isArray(result.data) && result.data.length <= 3, "safe_team_discovery_failed");
  for (const row of result.data) {
    check(typeof row.id === "string" && DETAIL.exec(`/teams/${row.id}`)?.[1] === "teams", "safe_team_id_invalid");
    details.add(`/teams/${row.id}`);
  }
  return result.data.length ? "authenticated_safe_view" : "no_safe_team_rows_not_covered";
}

async function main(argv) {
  const options = args(argv);
  safeFiles();
  const env = parseEnv(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8"));
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const dbUrl = new URL(env.SUPABASE_PREVIEW_DB_URL);
  check(api.origin === `https://${REF}.supabase.co`, "preview_api_required");
  check(dbUrl.hostname === `db.${REF}.supabase.co` || (dbUrl.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(dbUrl.username) === `postgres.${REF}`), "preview_db_required");
  check(dbUrl.pathname === "/postgres", "preview_database_required");
  dbUrl.searchParams.delete("sslmode");
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  check(publicKey && env.SUPABASE_SERVICE_ROLE_KEY, "preview_keys_required");
  const db = new Client({ connectionString: dbUrl.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  const admin = createClient(api.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const query = async (sql, values = []) => (await db.query(sql, values)).rows;
  async function migrationInstalled() {
    check((await query("select version from supabase_migrations.schema_migrations where version=$1", [MIGRATION])).length === 1, "install_reviewed_migration_first");
    check((await query("select to_regprocedure('public.director_readonly_rows(text,uuid[],integer,integer)') is not null as installed"))[0].installed, "safe_reader_not_installed");
  }
  async function fixture(state, allowMissing = false) {
    const users = await query("select id,email,raw_app_meta_data from auth.users where id=$1", [state.userId]);
    if (!users.length && allowMissing) return false;
    check(users.length === 1 && users[0].email === state.email && users[0].raw_app_meta_data?.purpose === PURPOSE && users[0].raw_app_meta_data?.validation_run_id === state.runId, "fixture_identity_mismatch");
    const roles = await query("select ur.id,r.code,ur.campus_id from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=$1", [state.userId]);
    check(roles.every((r) => r.id === state.roleRowId && r.code === "director_readonly" && r.campus_id === null) && roles.length <= 1, "fixture_roles_changed_abort");
    return true;
  }
  function jwtClient(state) {
    check(typeof state.accessToken === "string" && state.cookies?.length, "fixture_session_missing");
    const claims = JSON.parse(Buffer.from(state.accessToken.split(".")[1], "base64url").toString());
    check(claims.sub === state.userId && claims.iss === `${api.origin}/auth/v1` && claims.exp > Date.now() / 1000 + 30, "fixture_jwt_invalid_or_expired");
    return createClient(api.origin, publicKey, { global: { headers: { Authorization: `Bearer ${state.accessToken}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  }
  async function dbBoundary(state, revoked = false) {
    const client = jwtClient(state);
    const valid = await client.auth.getUser(state.accessToken);
    check(!valid.error && valid.data.user?.id === state.userId, "same_jwt_no_longer_valid");
    const predicate = await client.rpc("is_director_readonly");
    check(!predicate.error && predicate.data === !revoked, "role_predicate_failed");
    const rows = await client.rpc("director_readonly_rows", { p_resource: "campuses", p_limit: 1, p_offset: 0 });
    if (revoked) check(rows.error?.code === "42501", "revoked_safe_rpc_not_denied");
    else check(!rows.error && Array.isArray(rows.data) && rows.data.length > 0, "safe_rpc_failed");
    const view = await client.from("v_director_readonly_players").select("id").limit(1);
    if (revoked) check(view.error?.code === "42501" || (!view.error && view.data?.length === 0), "revoked_view_leaked");
    else check(!view.error && view.data?.length > 0, "safe_view_failed");
    {
      const finance = await client.rpc("get_dashboard_finance_summary", { p_month: "2026-09", p_campus_id: null });
      check(finance.error?.code === "42501", "finance_rpc_not_denied");
      for (const table of ["payments", "charges", "players"]) {
        const result = await client.from(table).select("id").limit(1);
        check(result.error?.code === "42501" || (!result.error && result.data?.length === 0), "raw_table_leaked");
      }
      const absentPlayerId = randomUUID();
      check(!(await query("select 1 from public.players where id=$1", [absentPlayerId])).length, "noop_target_not_absent");
      const mutation = await client.from("players").update({ status: "active" }).eq("id", absentPlayerId);
      check(mutation.error?.code === "42501", "postgrest_noop_update_not_denied");
    }
  }
  async function request(state, origin, route, init = {}) {
    const url = new URL(route, origin);
    check(url.origin === origin, "cross_origin_request_denied");
    return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(60000), headers: { Cookie: state.cookies.map((c) => `${c.name}=${c.value}`).join("; "), ...init.headers } });
  }
  async function denied(response, origin, state) {
    if ([401, 403].includes(response.status)) return true;
    if ([302, 303, 307, 308].includes(response.status)) {
      const url = new URL(response.headers.get("location") || "/", origin);
      if (url.origin !== origin) return false;
      if (["/unauthorized", "/login"].includes(url.pathname)) return true;
      // Current root sends authenticated users to /inicio; never count '/' alone as denial.
      const visited = new Set();
      let current = url;
      while (["/", "/inicio"].includes(current.pathname) && !visited.has(current.pathname) && visited.size < 3) {
        visited.add(current.pathname);
        const next = await request(state, origin, current.pathname);
        if ([401, 403].includes(next.status)) return true;
        if (![302, 303, 307, 308].includes(next.status)) return false;
        current = new URL(next.headers.get("location") || "/", origin);
        if (current.origin !== origin) return false;
        if (["/unauthorized", "/login"].includes(current.pathname)) return true;
      }
    }
    return false;
  }
  async function recoveryProof(state) {
    check(!state.recoveryAttemptedAt, "recovery_already_attempted_review_before_retry");
    check(state.revokedAt && typeof state.refreshToken === "string", "revoke_fixture_first_and_require_refresh_token");
    const identity = await jwtClient(state).auth.getUser(state.accessToken);
    check(!identity.error && identity.data.user?.id === state.userId, "recovery_initial_session_invalid");
    const crypto = await query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'");
    check(crypto.length === 1 && ["extensions", "public"].includes(crypto[0].nspname), "review_pgcrypto_schema_before_recovery");
    const crypt = crypto[0].nspname + ".crypt";
    let newPassword = "Dr!" + randomUUID();
    let resetCategory = "unknown";
    async function passwordMatches() {
      const rows = await query(`select coalesce(encrypted_password = ${crypt}($1,encrypted_password),false) as matches from auth.users where id=$2 and email=$3`, [newPassword, state.userId, state.email]);
      check(rows.length === 1, "recovery_fixture_missing");
      return rows[0].matches;
    }
    async function token(type) {
      await fixture(state);
      const link = await admin.auth.admin.generateLink({ type, email: state.email });
      check(!link.error && link.data.user?.id === state.userId && link.data.properties?.hashed_token, "synthetic_recovery_proof_link_failed");
      return link.data.properties.hashed_token;
    }
    async function reset(tokenHash) {
      const response = await request(state, options.target, "/api/auth/password", {
        method: "POST", headers: { Origin: options.target, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", token_hash: tokenHash, password: newPassword }),
      });
      check(!response.headers.getSetCookie().some((c) => c.startsWith(`sb-${REF}-auth-token`) && !/Max-Age=0/i.test(c)), "reset_returned_live_cookie");
      const result = await response.json().catch(() => null);
      // Fixed diagnostic categories only; never echo provider/app response text.
      resetCategory = result?.message === "El enlace no es valido o ya vencio. Solicita otro enlace."
        ? "token_rejected"
        : result?.message === "No se pudo cambiar la contrasena. Solicita un nuevo enlace e intenta con otra contrasena."
          ? "password_update_rejected"
          : response.status === 200 ? "success" : "other_backend_rejection";
      return response.status;
    }
    check(!(await passwordMatches()), "recovery_password_not_new");
    const before = await query("select count(*)::int as count from auth.sessions where user_id=$1", [state.userId]);
    check(before[0].count > 0, "recovery_has_no_existing_sessions");
    state.recoveryAttemptedAt = new Date().toISOString(); save(state);

    // Supabase verify.go intentionally uses RecoveryToken for both magiclink and
    // recovery. Record compatibility, not an unsupported purpose-isolation claim.
    const sharedEmailToken = await token("magiclink");
    check(await reset(sharedEmailToken) === 200 && await passwordMatches(), "shared_email_token_behavior_changed");
    check(await reset(sharedEmailToken) === 400 && resetCategory === "token_rejected", "shared_email_token_reuse_not_denied");
    state.sharedEmailTokenCompatibilityConfirmed = true; save(state);
    newPassword = "Dr!" + randomUUID();
    check(await reset("0".repeat(64)) === 400 && resetCategory === "token_rejected" && !(await passwordMatches()), "invalid_reset_not_rejected");

    // Create a fresh session after the compatibility check, so the following
    // successful recovery must revoke a session that really is still active.
    const activeClient = createClient(api.origin, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const active = await activeClient.auth.verifyOtp({ token_hash: await token("magiclink"), type: "magiclink" });
    check(!active.error && active.data.user?.id === state.userId && active.data.session?.refresh_token, "recovery_fresh_session_missing");
    const activeRefreshToken = active.data.session.refresh_token;

    const expired = await token("recovery");
    // Simulate expiry ONLY on the verified synthetic user's recovery timestamp.
    // No provider settings, CAPTCHA configuration, real identities or mail are touched.
    const aged = await query("update auth.users set recovery_sent_at=now()-interval '30 days' where id=$1 and email=$2 and raw_app_meta_data->>'purpose'=$3 and raw_app_meta_data->>'validation_run_id'=$4 and recovery_token is not null returning 1 as changed", [state.userId, state.email, PURPOSE, state.runId]);
    check(aged.length === 1, "synthetic_recovery_expiry_not_set");
    const expiredStatus = await reset(expired);
    check(expiredStatus === 400 && resetCategory === "token_rejected" && !(await passwordMatches()), `expired_reset_not_rejected status=${expiredStatus} category=${resetCategory}`);
    state.expiredResetDenied = true; save(state);

    const valid = await token("recovery");
    const status = await reset(valid);
    check(status === 200, `recovery_backend_failed status=${status} category=${resetCategory}`);
    check(await passwordMatches(), "recovery_password_not_changed");
    const reusedStatus = await reset(valid);
    check(reusedStatus === 400 && resetCategory === "token_rejected", `reused_reset_not_rejected status=${reusedStatus} category=${resetCategory}`);
    state.reusedResetDenied = true; save(state);
    const after = await query("select count(*)::int as count from auth.sessions where user_id=$1", [state.userId]);
    check(after[0].count === 0, "recovery_sessions_not_removed");
    const isolated = createClient(api.origin, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const refresh = await isolated.auth.refreshSession({ refresh_token: state.refreshToken });
    check(!!refresh.error && !refresh.data.session, "recovery_old_refresh_not_revoked");
    const freshRefresh = await isolated.auth.refreshSession({ refresh_token: activeRefreshToken });
    check(!!freshRefresh.error && !freshRefresh.data.session, "recovery_fresh_refresh_not_revoked");
    state.recoveryPassedAt = new Date().toISOString(); save(state);
    safeFiles(); if (fs.existsSync(BROWSER)) fs.unlinkSync(BROWSER);
    console.log("PASS Preview synthetic backend recovery: shared magiclink/recovery behavior confirmed; invalid/expired/reused tokens denied; valid recovery changes password; all fixture sessions removed; both old and fresh refresh rejected. Expiry simulated on fixture only. No strict token-purpose isolation or mail/CAPTCHA proof; unexpired access JWTs may remain valid until expiry.");
  }
  await db.connect();
  try {
    if (options.mode === "--setup") {
      check(!fs.existsSync(STATE) && !fs.existsSync(BROWSER), "existing_fixture_cleanup_required");
      await migrationInstalled();
      const runId = randomUUID(), email = `director-readonly-validation-${runId}@example.invalid`;
      check(!(await query("select 1 from auth.users where email=$1", [email])).length, "synthetic_email_collision");
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { purpose: PURPOSE, validation_run_id: runId } });
      check(!created.error && created.data.user?.id, "synthetic_create_failed");
      const state = { purpose: PURPOSE, ref: REF, runId, email, userId: created.data.user.id, roleRowId: null, createdAt: new Date().toISOString() };
      save(state); // Persist immediately so a later step can be safely cleaned up.
      await fixture(state);
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      check(!link.error && link.data.user?.id === state.userId && link.data.properties?.hashed_token, "fixture_link_failed");
      const cookies = [];
      const sessionClient = createServerClient(api.origin, publicKey, { cookies: { getAll: () => cookies, setAll: (items) => { for (const item of items) { const index = cookies.findIndex((c) => c.name === item.name); const cookie = { name: item.name, value: item.value }; if (index < 0) cookies.push(cookie); else cookies[index] = cookie; } } } });
      const verified = await sessionClient.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
      check(!verified.error && verified.data.user?.id === state.userId && verified.data.session, "fixture_session_failed");
      state.accessToken = verified.data.session.access_token; state.refreshToken = verified.data.session.refresh_token; state.cookies = cookies; save(state);
      await dbBoundary(state, true);
      for (const route of ["/players", "/dashboard", "/api/players/grouped-roster"]) check(await denied(await request(state, options.target, route), options.target, state), "unassigned_http_access_not_denied");
      state.preGrantDenialPassed = true; save(state);
      await db.query("BEGIN");
      await query("select id from auth.users where id=$1 for update", [state.userId]);
      await fixture(state);
      const role = await query("insert into public.user_roles(user_id,role_id,campus_id) select $1,id,null from public.app_roles where code='director_readonly' returning id", [state.userId]);
      check(role.length === 1, "fixture_role_missing");
      state.roleRowId = role[0].id; save(state);
      await db.query("COMMIT");
      await dbBoundary(state);
      console.log("PASS setup: provider provisioning/session works before assignment; no-role DB/HTTP denial passed; same JWT passes director_readonly boundaries after grant. Zero messages; not email/CAPTCHA E2E.");
    } else {
      const state = load();
      if (options.mode === "--cleanup") {
        if (await fixture(state, true)) {
          const result = await admin.auth.admin.deleteUser(state.userId);
          check(!result.error, "fixture_delete_failed");
        }
        check(!(await query("select 1 from auth.users where id=$1", [state.userId])).length, "fixture_delete_unconfirmed");
        safeFiles();
        for (const file of [BROWSER, STATE]) if (fs.existsSync(file)) fs.unlinkSync(file);
        console.log("PASS cleanup: only verified synthetic account and its two state files removed.");
        return;
      }
      await migrationInstalled(); await fixture(state);
      if (options.mode === "--browser-state") {
        check(!state.revokedAt, "fixture_revoked"); await dbBoundary(state);
        const url = new URL(options.target);
        const cookies = state.cookies.map((c) => { check(c.name.startsWith(`sb-${REF}-auth-token`), "unexpected_cookie"); return { name: c.name, value: c.value, domain: url.hostname, path: "/", expires: -1, httpOnly: false, secure: url.protocol === "https:", sameSite: "Lax" }; });
        fs.writeFileSync(BROWSER, JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
        console.log("Browser storageState ready: .tmp/director-readonly-browser-state.json (secrets not printed; load only on requested allowlisted origin).");
      }
      if (options.mode === "--revoke") {
        jwtClient(state); // Expired JWT cannot prove authorization revocation.
        await db.query("BEGIN");
        await query("select id from auth.users where id=$1 for update", [state.userId]);
        await fixture(state);
        await query("delete from public.user_roles where id=$1 and user_id=$2 and role_id=(select id from public.app_roles where code='director_readonly')", [state.roleRowId, state.userId]);
        await db.query("COMMIT");
        state.revokedAt = new Date().toISOString(); save(state);
        await dbBoundary(state, true);
        if (options.target) for (const route of ["/players", "/api/players/grouped-roster"]) check(await denied(await request(state, options.target, route), options.target, state), "revoked_http_access_not_denied");
        console.log("PASS revoke: only fixture role removed; same unrefreshed JWT still authenticated but safe data access denied.");
      }
      if (options.mode === "--recovery") await recoveryProof(state);
      if (options.mode === "--http") {
        check(!state.revokedAt, "fixture_revoked"); await dbBoundary(state);
        const details = new Set(); let checked = 0;
        async function testPage(route) {
          const response = await request(state, options.target, route);
          check(response.status === 200 && response.headers.get("content-type")?.includes("text/html"), `html_page_failed ${responseSummary(response, route, options.target)}`);
          const html = await response.text();
          try { checkPageBody(html); } catch (error) { if (!(error instanceof ValidationError)) throw error; throw new ValidationError(`html_body_failed ${responseSummary(response, route, options.target)}`); }
          const rsc = await request(state, options.target, rscProbeRoute(route), { headers: { RSC: "1" } });
          check(rsc.status === 200 && rsc.headers.get("content-type")?.includes("text/x-component"), `rsc_page_failed ${responseSummary(rsc, route, options.target)}`);
          try { checkPageBody(await rsc.text()); } catch (error) { if (!(error instanceof ValidationError)) throw error; throw new ValidationError(`rsc_body_failed ${responseSummary(rsc, route, options.target)}`); }
          for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
            const url = new URL(match[1].replaceAll("&amp;", "&"), options.target);
            if (url.origin === options.target && DETAIL.test(url.pathname)) details.add(url.pathname);
          }
        }
        for (const route of PAGES) { await testPage(route); checked++; }
        const teamDiscovery = await discoverTeamDetails(jwtClient(state), details);
        const testedDetails = new Set();
        // A second round discovers nested report links from the first detail pages.
        for (let round = 0; round < 2; round++) for (const routes of sampleDetails(details).values()) {
          for (const route of routes) if (!testedDetails.has(route)) { await testPage(route); testedDetails.add(route); }
        }
        const roster = await request(state, options.target, "/api/players/grouped-roster");
        check(roster.status === 200 && roster.headers.get("content-type")?.includes("application/json"), "grouped_roster_failed");
        checkPayload(await roster.json());
        for (const route of ["/llamadas", "/llamadas/detail", "/pending", "/admin/users", "/reports/corte-diario", "/caja/sesion", "/api/receipts", "/api/exports/pending-detail", "/api/exports/product-charge-ledger", "/api/exports/finance-sanity"]) check(await denied(await request(state, options.target, route), options.target, state), "restricted_route_not_denied");
        // Empty bodies and an unknown action ID cannot request an academy mutation.
        for (const route of ["/players", "/caja", "/api/players/grouped-roster", "/api/payments", "/_next/static/test.js"]) check((await request(state, options.target, route, { method: "POST", body: "{}", headers: { Origin: options.target, "Content-Type": "application/json" } })).status === 403, "post_not_403");
        check((await request(state, options.target, "/dashboard", { method: "POST", body: "[]", headers: { Origin: options.target, "Content-Type": "text/plain", "Next-Action": "0000000000000000000000000000000000000000" } })).status === 403, "next_action_not_403");
        const detailCoverage = Object.fromEntries(["players", "teams", "tournaments", "convocatorias", "attendance/sessions", "nutrition/players", "nutrition/players/report"].map((resource) => [resource, [...testedDetails].filter((r) => { const m = DETAIL.exec(r); return m && m[1] + (m[2] || "") === resource; }).length || "no_links_discovered_not_covered"]));
        if (teamDiscovery === "no_safe_team_rows_not_covered") detailCoverage.teams = teamDiscovery;
        console.log(JSON.stringify({ pagesPassed: checked, htmlAndRsc: "passed", detailPagesPassed: testedDetails.size, detailCoverage, teamDiscovery, groupedRoster: "passed", rawAndFinanceDenial: "passed", postgrestAbsentRowUpdate42501: "passed", mutation403: "passed", notes: "No PII or secrets logged; visual QA and full payload review still required." }));
      }
    }
  } finally { await db.query("ROLLBACK").catch(() => {}); await db.end(); }
}
module.exports = { args, targetOrigin, checkPayload, checkPageBody, sampleDetails, responseSummary, rscProbeRoute, discoverTeamDetails };
if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(`Validation failed: ${error instanceof ValidationError ? error.message : "external_error_details_suppressed"}. Fixture state retained for guarded cleanup.`); process.exitCode = 1; });
