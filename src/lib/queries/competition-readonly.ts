import "server-only";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyWeekStart } from "@/lib/queries/weekly-callups";
import { getCompetitionBoardReadProjection } from "@/lib/queries/sports-signups";
import { formatTrainingGroupDisplayName, formatCompetitionSquadDisplay, formatCampusCompetitionTeamName } from "@/lib/training-groups/shared";

type Admin = ReturnType<typeof createAdminClient>;
type Campus = { id: string; name: string };
type TournamentRow = { id: string; campus_id: string; name: string; start_date: string | null; end_date: string | null; signup_deadline: string | null; is_active: boolean };
export type SportingTournament = { id: string; campusId: string; campusName: string; name: string; startDate: string | null; endDate: string | null; signupDeadline: string | null; isActive: boolean };
export type SportingPlayer = { id: string; name: string; birthYear: number | null };
export type SportingGame = { id: string; date: string; time: string; venue: string; opponent: string; players: SportingPlayer[] };
export type SportingReport = { id: string; coach: string; updatedAt: string; isRest: boolean; games: SportingGame[] };
export type SportingSquad = { id: string; name: string; tournamentId: string; tournamentName: string; campusId: string; program: string; category: string; coaches: string[]; groups: string[]; players: SportingPlayer[]; reports: SportingReport[] };
export type SportingRegistration = SportingPlayer & { groupIds: string[]; groups: string[]; programs: string[] };
export type CompetitionReadData = { campuses: Campus[]; campusId: string; tournaments: SportingTournament[]; tournament: SportingTournament | null; week: string; registrationsAvailable: boolean; registrations: SportingRegistration[]; registrationBoards: Array<{ tournamentId: string | null; players: SportingRegistration[] }>; squads: SportingSquad[] };
export type SportingCallup = { id: string; name: string; campusId: string; campusName: string; program: string; week: string; status: string; categories: Array<{ id: string; name: string; tournamentName: string; coaches: string; isRest: boolean; players: SportingPlayer[]; games: SportingGame[] }> };

// Every collection is paginated and every ID fan-out is bounded. No RPCs or
// synchronization actions belong in this read path.
async function pages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await build(offset, offset + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

async function byIds<T>(ids: string[], build: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    rows.push(...await pages((from, to) => build(unique.slice(offset, offset + 100), from, to)));
  }
  return rows;
}

function year(date: string | null) { return date && /^\d{4}-/.test(date) ? Number(date.slice(0, 4)) : null; }
function sortPlayers<T extends SportingPlayer>(rows: T[]) { return rows.sort((a, b) => a.name.localeCompare(b.name, "es")); }
function uniquePlayers<T extends SportingPlayer>(rows: T[]) { return sortPlayers([...new Map(rows.map((row) => [row.id, row])).values()]); }
export function competitionReadWeek(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return getMonterreyWeekStart();
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1 ? value : getMonterreyWeekStart();
}

async function context() {
  const permission = await getPermissionContext();
  if (!permission?.isDirectorReadOnly || !permission.hasSportsReadAccess) return null;
  const campuses = (permission.campusAccess?.campuses ?? [])
    .filter((campus) => permission.campusAccess?.campusIds.includes(campus.id))
    .map(({ id, name }) => ({ id, name }));
  if (!campuses.length) return null;
  return { admin: createAdminClient(), campuses };
}

async function tournaments(admin: Admin, campuses: Campus[]): Promise<SportingTournament[]> {
  const rows = await byIds<TournamentRow>(campuses.map((c) => c.id), (ids, from, to) => admin.from("tournaments")
    .select("id, campus_id, name, start_date, end_date, signup_deadline, is_active")
    .in("campus_id", ids).order("id").range(from, to).returns<TournamentRow[]>());
  return rows.map((row) => ({ id: row.id, campusId: row.campus_id, campusName: campuses.find((c) => c.id === row.campus_id)!.name,
    name: row.name, startDate: row.start_date, endDate: row.end_date, signupDeadline: row.signup_deadline, isActive: row.is_active }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "es"));
}

type Enrollment = { id: string; player_id: string; campus_id: string; players: { first_name: string; last_name: string; birth_date: string | null } | null };

type SquadRow = { id: string; tournament_id: string; name: string; program: string; category_label: string; coach_assignment_mode: string; squad_kind: string };
type GroupLink = { squad_id: string; training_group_id: string; training_groups: { name: string; campus_id: string; program: string } | null };
type Coach = { first_name: string; last_name: string };
type CoachLink = { squad_id?: string; training_group_id?: string; coaches: Coach | null };
type Member = { squad_id: string; enrollments: Enrollment | null };
type ReportRow = { id: string; competition_roster_squad_id: string; is_rest: boolean; updated_at: string; coaches: Coach | null };
type GameRow = { id: string; report_id: string; match_date: string; arrival_time: string; venue: string; opponent: string };
type GamePlayerRow = { game_id: string; player_id: string; player_name_snapshot: string };
const coachName = (coach: Coach | null) => coach ? `${coach.first_name} ${coach.last_name}`.trim() : "Sin profesor";

async function squads(admin: Admin, catalog: SportingTournament[], week: string): Promise<SportingSquad[]> {
  const rows = await byIds<SquadRow>(catalog.map((t) => t.id), (ids, from, to) => admin.from("competition_roster_squads")
    .select("id, tournament_id, name, program, category_label, coach_assignment_mode, squad_kind").in("tournament_id", ids)
    .neq("status", "archived").order("id").range(from, to).returns<SquadRow[]>());
  const ids = rows.map((s) => s.id);
  const links = await byIds<GroupLink>(ids, (chunk, from, to) => admin.from("competition_roster_squad_groups")
    .select("squad_id, training_group_id, training_groups(name, campus_id, program)").in("squad_id", chunk)
    .order("squad_id").order("training_group_id").range(from, to).returns<GroupLink[]>());
  const directCoaches = await byIds<CoachLink>(ids, (chunk, from, to) => admin.from("competition_roster_squad_coaches")
    .select("squad_id, coaches(first_name, last_name)").in("squad_id", chunk)
    .order("squad_id").order("coach_id").range(from, to).returns<CoachLink[]>());
  const groupCoaches = await byIds<CoachLink>(links.map((l) => l.training_group_id), (chunk, from, to) => admin.from("training_group_coaches")
    .select("training_group_id, coaches(first_name, last_name)").in("training_group_id", chunk)
    .order("training_group_id").order("coach_id").range(from, to).returns<CoachLink[]>());
  const members = await byIds<Member>(ids, (chunk, from, to) => admin.from("competition_roster_squad_members")
    .select("squad_id, enrollments!inner(id, player_id, campus_id, players(first_name, last_name, birth_date))")
    .in("squad_id", chunk).order("squad_id").order("enrollment_id").range(from, to).returns<Member[]>());
  const reports = await byIds<ReportRow>(ids, (chunk, from, to) => admin.from("coach_weekly_schedule_reports")
    .select("id, competition_roster_squad_id, is_rest, updated_at, coaches(first_name, last_name)")
    .in("competition_roster_squad_id", chunk).eq("week_start", week).order("id").range(from, to).returns<ReportRow[]>());
  const games = await byIds<GameRow>(reports.map((r) => r.id), (chunk, from, to) => admin.from("coach_weekly_schedule_games")
    .select("id, report_id, match_date, arrival_time, venue, opponent").in("report_id", chunk)
    .order("match_date").order("id").range(from, to).returns<GameRow[]>());
  const gamePlayers = await byIds<GamePlayerRow>(games.map((g) => g.id), (chunk, from, to) => admin.from("coach_weekly_schedule_game_players")
    .select("game_id, player_id, player_name_snapshot").in("game_id", chunk).eq("roster_status", "included")
    .order("game_id").order("enrollment_id").range(from, to).returns<GamePlayerRow[]>());
  return rows.map((row) => {
    const tournament = catalog.find((t) => t.id === row.tournament_id)!;
    const groups = links.filter((l) => l.squad_id === row.id && l.training_groups?.campus_id === tournament.campusId);
    const coaches = row.coach_assignment_mode === "manual" ? directCoaches.filter((c) => c.squad_id === row.id)
      : groupCoaches.filter((c) => groups.some((g) => g.training_group_id === c.training_group_id));
    const display = formatCompetitionSquadDisplay({ name: row.name, program: row.program, categoryLabel: row.category_label, kind: row.squad_kind, sourceGroupCount: groups.length });
    return { id: row.id, name: formatCampusCompetitionTeamName(tournament.campusName, display.title), tournamentId: tournament.id, tournamentName: tournament.name, campusId: tournament.campusId,
      program: row.program, category: display.categoryLabel, groups: groups.map((g) => formatTrainingGroupDisplayName(g.training_groups!)), coaches: [...new Set(coaches.map((c) => coachName(c.coaches)))],
      players: uniquePlayers(members.filter((m) => m.squad_id === row.id).flatMap((m) => {
        const e = m.enrollments;
        return e?.players && e.campus_id === tournament.campusId ? [{ id: e.player_id, name: `${e.players.first_name} ${e.players.last_name}`.trim(), birthYear: year(e.players.birth_date) }] : [];
      })),
      reports: reports.filter((r) => r.competition_roster_squad_id === row.id).map((r) => ({ id: r.id, coach: coachName(r.coaches), updatedAt: r.updated_at, isRest: r.is_rest,
        games: games.filter((g) => g.report_id === r.id).map((g) => ({ id: g.id, date: g.match_date, time: g.arrival_time, venue: g.venue, opponent: g.opponent,
          players: uniquePlayers(gamePlayers.filter((p) => p.game_id === g.id).map((p) => ({ id: p.player_id, name: p.player_name_snapshot, birthYear: null }))) })) })) };
  }).sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export async function getCompetitionReadData(filters: { campus?: string; competition?: string; week?: string } = {}): Promise<CompetitionReadData | null> {
  const ctx = await context();
  if (!ctx) return null;
  if (filters.campus && !ctx.campuses.some((c) => c.id === filters.campus)) return null;
  const catalog = await tournaments(ctx.admin, ctx.campuses);
  let requestedId = filters.competition ?? "";
  // Preserve staff-created deep links without serializing product IDs.
  if (requestedId.startsWith("product:")) {
    const result = await ctx.admin.from("tournaments").select("id").eq("product_id", requestedId.slice(8))
      .in("campus_id", filters.campus ? [filters.campus] : ctx.campuses.map((c) => c.id)).order("id").limit(1).maybeSingle<{ id: string }>();
    if (result.error) throw result.error;
    if (!result.data) return null;
    requestedId = result.data.id;
  }
  const requested = requestedId ? catalog.find((t) => t.id === requestedId) : null;
  if (requestedId && (!requested || (filters.campus && requested.campusId !== filters.campus))) return null;
  const campusId = filters.campus || requested?.campusId || ctx.campuses[0].id;
  const available = catalog.filter((t) => t.campusId === campusId);
  const tournament = requested ?? available[0] ?? null;
  const week = competitionReadWeek(filters.week);
  const registrationBoards = await getCompetitionBoardReadProjection(campusId);
  if (!registrationBoards) return null;
  const registrationRows = registrationBoards.find((b) => b.tournamentId === tournament?.id)?.players;
  // Archived tournaments remain in the catalog but not in the current signup board.
  return { campuses: ctx.campuses, campusId, tournaments: available, tournament, week,
    registrationsAvailable: registrationRows !== undefined,
    registrations: sortPlayers(registrationRows ?? []), registrationBoards,
    squads: tournament ? await squads(ctx.admin, [tournament], week) : [] };
}

export async function getTournamentReadCatalog() {
  const ctx = await context();
  return ctx ? await tournaments(ctx.admin, ctx.campuses) : null;
}

type CallupRow = { id: string; campus_id: string; program: string; week_start: string; status: string; tournaments: { name: string } | null };
type CategoryRow = { id: string; weekly_callup_id: string; category_label: string; training_group_name_snapshot: string; tournament_name_snapshot: string; coach_names_snapshot: string; is_rest: boolean };
type CallupPlayerRow = { weekly_callup_category_id: string; player_id: string; player_name_snapshot: string; birth_year: number | null };
type CallupGameRow = { id: string; weekly_callup_category_id: string; match_date: string; arrival_time: string; venue: string; opponent: string };
type CallupGamePlayerRow = { weekly_callup_game_id: string; player_id: string; player_name_snapshot: string };

async function callupRows(admin: Admin, campuses: Campus[], callupId?: string) {
  return byIds<CallupRow>(campuses.map((c) => c.id), (ids, from, to) => {
    let query = admin.from("weekly_callups").select("id, campus_id, program, week_start, status, tournaments(name)").in("campus_id", ids);
    if (callupId) query = query.eq("id", callupId);
    return query.order("week_start", { ascending: false }).order("id").range(from, to).returns<CallupRow[]>();
  });
}

async function callups(admin: Admin, campuses: Campus[], callupId: string): Promise<SportingCallup[]> {
  const rows = await callupRows(admin, campuses, callupId);
  const categories = await byIds<CategoryRow>(rows.map((r) => r.id), (ids, from, to) => admin.from("weekly_callup_categories")
    .select("id, weekly_callup_id, category_label, training_group_name_snapshot, tournament_name_snapshot, coach_names_snapshot, is_rest")
    .in("weekly_callup_id", ids).order("sort_order").order("id").range(from, to).returns<CategoryRow[]>());
  const players = await byIds<CallupPlayerRow>(categories.map((c) => c.id), (ids, from, to) => admin.from("weekly_callup_players")
    .select("weekly_callup_category_id, player_id, player_name_snapshot, birth_year").in("weekly_callup_category_id", ids)
    .eq("roster_status", "included").order("id").range(from, to).returns<CallupPlayerRow[]>());
  const games = await byIds<CallupGameRow>(categories.map((c) => c.id), (ids, from, to) => admin.from("weekly_callup_games")
    .select("id, weekly_callup_category_id, match_date, arrival_time, venue, opponent").in("weekly_callup_category_id", ids)
    .order("match_date").order("sort_order").order("id").range(from, to).returns<CallupGameRow[]>());
  const gamePlayers = await byIds<CallupGamePlayerRow>(games.map((g) => g.id), (ids, from, to) => admin.from("weekly_callup_game_players")
    .select("weekly_callup_game_id, player_id, player_name_snapshot").in("weekly_callup_game_id", ids).eq("roster_status", "included")
    .order("weekly_callup_game_id").order("enrollment_id").range(from, to).returns<CallupGamePlayerRow[]>());
  return rows.map((row) => ({ id: row.id, name: row.tournaments?.name ?? "Convocatoria semanal", campusId: row.campus_id,
    campusName: campuses.find((c) => c.id === row.campus_id)!.name, program: row.program, week: row.week_start, status: row.status,
    categories: categories.filter((c) => c.weekly_callup_id === row.id).map((c) => ({ id: c.id,
      name: formatCampusCompetitionTeamName(campuses.find((campus) => campus.id === row.campus_id)!.name,
        formatCompetitionSquadDisplay({ name: c.training_group_name_snapshot, program: row.program, categoryLabel: c.category_label }).title),
      tournamentName: c.tournament_name_snapshot, coaches: c.coach_names_snapshot, isRest: c.is_rest,
      players: uniquePlayers(players.filter((p) => p.weekly_callup_category_id === c.id).map((p) => ({ id: p.player_id, name: p.player_name_snapshot, birthYear: p.birth_year }))),
      games: games.filter((g) => g.weekly_callup_category_id === c.id).map((g) => ({ id: g.id, date: g.match_date, time: g.arrival_time, venue: g.venue, opponent: g.opponent,
        players: uniquePlayers(gamePlayers.filter((p) => p.weekly_callup_game_id === g.id).map((p) => ({ id: p.player_id, name: p.player_name_snapshot, birthYear: null }))) })) })) }));
}

export async function getCallupReadDetail(id: string) {
  const ctx = await context();
  return ctx ? (await callups(ctx.admin, ctx.campuses, id))[0] ?? null : null;
}

export async function getCallupReadDashboard(filters: { campus?: string; week?: string } = {}) {
  const ctx = await context();
  if (!ctx || (filters.campus && !ctx.campuses.some((c) => c.id === filters.campus))) return null;
  const campusId = filters.campus || ctx.campuses[0].id;
  const selectedCampuses = ctx.campuses;
  const catalog = await tournaments(ctx.admin, selectedCampuses);
  const week = competitionReadWeek(filters.week);
  const saved = await callupRows(ctx.admin, selectedCampuses);
  return { campuses: ctx.campuses, campusId, week,
    squads: await squads(ctx.admin, catalog.filter((t) => t.isActive), week),
    callups: saved.map((row) => ({ id: row.id, campusId: row.campus_id, campusName: ctx.campuses.find((campus) => campus.id === row.campus_id)!.name, name: row.tournaments?.name ?? "Convocatoria semanal", program: row.program, week: row.week_start })) };
}
