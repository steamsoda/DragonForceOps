-- Mapa de Área — continuous quality/incident log.
-- Matches the Porto Mapa de Área tab structure per Directrices de Utilización.
--
-- Type codes (from Directrices + observed in data):
--   R   = Reclamación
--   SM  = Sugerencia de Mejoría
--   C   = Constatación
--   NC  = No Conforme
--   PNC = Posible No Conforme
--   AS  = Auditoría
--   OM  = Orden de Mejora
--   M   = Mantenimiento
-- Stored as text — Porto may add codes over time.
--
-- Predefined topics (Directrices section 6):
--   Material Deportivo, Decoración y publicidad, Kit alumnos, Kit entrenadores,
--   Nutrición, Psicología, Fisioterapia, Secretaria, Entrenadores,
--   Padres de familia y alumnos, Torneos y equipos de competencia, Instalaciones,
--   Auditoría Externa, Auditoría Interna, Organización de la escuela,
--   Hardware, Software
--
-- Lifecycle: open (closure_date IS NULL) → closed (closure_date set + effectiveness E/NE/SP)

create table public.area_map_entries (
  id                 uuid primary key default gen_random_uuid(),
  entry_date         date not null,
  type_code          text not null,              -- R / SM / C / NC / PNC / AS / OM / M
  topic              text not null,              -- from predefined topic list
  description        text not null,              -- Descripción del tema
  root_cause         text null,                  -- Análisis de las Causas
  corrective_action  text null,                  -- Acción Correctiva (immediate)
  correction_action  text null,                  -- Acción de Corrección (systemic)
  assigned_to        text null,                  -- Encaminado para (free text)
  deadline_days      int null,                   -- Plazo (number of days)
  closure_date       date null,                  -- Cierre de incidencia
  effectiveness      text null                   -- E / NE / SP
    check (effectiveness is null or effectiveness in ('E', 'NE', 'SP')),
  campus_id          uuid null references public.campuses(id) on delete set null,
  created_by         uuid null references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index area_map_entries_date_idx    on public.area_map_entries (entry_date);
create index area_map_entries_open_idx    on public.area_map_entries (closure_date) where closure_date is null;
create index area_map_entries_campus_idx  on public.area_map_entries (campus_id);

alter table public.area_map_entries enable row level security;

create policy "area_map_select_authenticated"
  on public.area_map_entries for select
  to authenticated
  using (true);

create policy "area_map_insert_operational"
  on public.area_map_entries for insert
  to authenticated
  with check (public.has_operational_access());

create policy "area_map_update_director"
  on public.area_map_entries for update
  to authenticated
  using (public.is_director_admin());

create policy "area_map_delete_director"
  on public.area_map_entries for delete
  to authenticated
  using (public.is_director_admin());
