-- Add uniform_size to players table
alter table players add column if not exists uniform_size text null;

comment on column players.uniform_size is 'Player uniform size (e.g. CH JR, M, G, XL). Null = not recorded.';
