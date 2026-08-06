-- Snapshot writes are performed by audited server actions using the trusted
-- service client. Keep authenticated callers read-only so eligibility cannot
-- be spoofed through the exposed REST API.

revoke insert, update, delete on public.weekly_callups from authenticated;
revoke insert, update, delete on public.weekly_callup_categories from authenticated;
revoke insert, update, delete on public.weekly_callup_players from authenticated;
revoke insert, update, delete on public.weekly_callup_games from authenticated;
