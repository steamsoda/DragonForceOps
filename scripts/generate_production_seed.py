"""
DragonForce Production Seed Generator
Reads the master player CSV and outputs scripts/seed_production.sql
Run: python scripts/generate_production_seed.py
"""

import csv
import re
import uuid
from datetime import date, datetime

CSV_PATH = "docs/Reference Docs/DragonForce_Prod_Contactos_Review.xlsx - Jugadores.csv"
OUT_PATH = "scripts/seed_production.sql"

TUITION_AMOUNT   = 600.00
DEFAULT_ENROLL   = date(2025, 8, 1)

MONTHS = [
    ("ENE", 17, date(2026, 1, 1),  date(2026, 1, 31)),
    ("FEB", 18, date(2026, 2, 1),  date(2026, 2, 28)),
    ("MZO", 19, date(2026, 3, 1),  date(2026, 3, 31)),
]
MONTH_LABEL = {"ENE": "Enero", "FEB": "Febrero", "MZO": "Marzo"}

SKIP_HOJAS = {"MZO LV", "MZO CON"}
JUNK_NAMES = {"-", "n/a", "n.l.", "nl", "na", "—", ""}

# ── helpers ────────────────────────────────────────────────────────────────────

def uid():
    return str(uuid.uuid4())

def q(val):
    """SQL-quote a string or return NULL."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"

def qd(d):
    """SQL-quote a date."""
    return "NULL" if d is None else f"'{d.isoformat()}'"

def get(row, idx):
    return row[idx].strip() if len(row) > idx else ""

def parse_date(raw):
    if not raw or not raw[:4].isdigit():
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except Exception:
        return None

def is_real_date(raw):
    d = parse_date(raw)
    return d is not None and d.year >= 2020

def split_name(full):
    """Split 'NOMBRE APELLIDO1 APELLIDO2' into (first, last)."""
    parts = full.strip().split()
    parts = [p.title() for p in parts if p]
    if len(parts) >= 4:
        return " ".join(parts[:2]), " ".join(parts[2:])
    if len(parts) == 3:
        return parts[0], " ".join(parts[1:])
    if len(parts) == 2:
        return parts[0], parts[1]
    return full.title(), ""

def is_valid_name(raw):
    """Reject junk values in guardian name columns."""
    if not raw:
        return False
    clean = raw.strip().lower()
    if clean in JUNK_NAMES:
        return False
    if "@" in raw:          # email bled into name cell
        return False
    if not re.search(r"[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]", raw):
        return False
    return True

def clean_email(raw):
    """Extract a valid-looking email from a possibly dirty cell."""
    if not raw:
        return None
    # If there are spaces and an @, try to grab just the email token
    parts = raw.split()
    for p in parts:
        if "@" in p and "." in p.split("@")[-1]:
            return p.strip()
    if "@" in raw and " " not in raw:
        return raw.strip()
    return None

def infer_gender(gender_raw, hoja):
    g = gender_raw.lower()
    if g == "female":
        return "female"
    if g == "male":
        return "male"
    if "FEM" in hoja.upper():
        return "female"
    return "male"

# ── read CSV ───────────────────────────────────────────────────────────────────

with open(CSV_PATH, encoding="utf-8") as f:
    all_rows = list(csv.reader(f))

header_idx = next(i for i, r in enumerate(all_rows) if r and r[0] == "#")
data_rows  = [r for r in all_rows[header_idx + 1:] if r and r[0].strip().isdigit()]

print(f"Loaded {len(data_rows)} player rows")

# ── collect unique teams ───────────────────────────────────────────────────────

team_ids = {}   # (campus_code, hoja) -> uuid
for row in data_rows:
    key = (get(row, 1), get(row, 2))
    if key not in team_ids:
        team_ids[key] = uid()

# ── stats counters ─────────────────────────────────────────────────────────────

stats = {
    "players": 0, "enrollments": 0, "guardians": 0,
    "charges": 0, "payments": 0, "allocations": 0,
    "beca": 0, "no_team": 0,
}

# ── generate SQL ───────────────────────────────────────────────────────────────

lines = []
lines += [
    "-- =============================================================",
    "-- DragonForce Production Seed — 687 Jugadores",
    f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    "-- Run in Supabase SQL Editor (runs as postgres, bypasses RLS)",
    "-- =============================================================",
    "",
    "BEGIN;",
    "",
]

# ── 1. Teams ───────────────────────────────────────────────────────────────────

lines.append("-- ─── 1. Teams ──────────────────────────────────────────────")
for (campus_code, hoja), team_id in sorted(team_ids.items()):
    gender = "female" if "FEM" in hoja.upper() else "male"
    # Try to extract birth year from hoja label (e.g. "2013", "FEM 14-15")
    year_match = re.search(r"\b(20\d{2})\b", hoja)
    birth_year = int(year_match.group(1)) if year_match else "NULL"
    lines.append(
        f"INSERT INTO public.teams "
        f"(id, campus_id, name, birth_year, gender, season_label, is_active) VALUES ("
        f"'{team_id}', "
        f"(SELECT id FROM public.campuses WHERE code = {q(campus_code)} LIMIT 1), "
        f"{q(hoja)}, {birth_year}, {q(gender)}, '2025-2026', true) "
        f"ON CONFLICT (campus_id, name, season_label) DO NOTHING;"
    )
lines.append("")

# ── 2. Players + enrollments + guardians + ledger ─────────────────────────────

lines.append("-- ─── 2. Players, Enrollments, Guardians, Charges, Payments ─")

for row in data_rows:
    row_num     = get(row, 0)
    campus_code = get(row, 1)
    hoja        = get(row, 2)
    nombre      = get(row, 3)
    yr_raw      = get(row, 4)
    bd_raw      = get(row, 5)
    gender_raw  = get(row, 6)
    tel_mama    = get(row, 9)
    tel_papa    = get(row, 10)
    tel_pref    = get(row, 11)
    nom_mama    = get(row, 12)
    nom_papa    = get(row, 13)
    email_xl    = get(row, 14)
    email_360   = get(row, 15)
    insc_raw    = get(row, 16)
    ene_raw     = get(row, 17)
    feb_raw     = get(row, 18)
    mzo_raw     = get(row, 19)

    month_vals = [ene_raw, feb_raw, mzo_raw]
    is_beca = any(v == "BECA" for v in month_vals)

    # ── birth date
    birth_year = int(yr_raw) if yr_raw.isdigit() else None
    birth_date = parse_date(bd_raw)
    if birth_date is None and birth_year:
        birth_date = date(birth_year, 1, 1)
    if birth_date is None:
        birth_date = date(2000, 1, 1)   # absolute fallback (should not occur)

    # ── enrollment date
    insc_date = parse_date(insc_raw) if is_real_date(insc_raw) else None
    if insc_date is None:
        insc_date = DEFAULT_ENROLL

    # ── names / gender / email
    first_name, last_name = split_name(nombre)
    gender     = infer_gender(gender_raw, hoja)
    email      = clean_email(email_xl) or clean_email(email_360)

    # ── IDs
    player_id     = uid()
    enrollment_id = uid()
    team_id       = team_ids.get((campus_code, hoja))

    lines.append(f"\n-- #{row_num}: {nombre}")

    # Player
    lines.append(
        f"INSERT INTO public.players "
        f"(id, first_name, last_name, birth_date, gender, status) VALUES ("
        f"'{player_id}', {q(first_name)}, {q(last_name)}, "
        f"'{birth_date.isoformat()}', {q(gender)}, 'active');"
    )
    stats["players"] += 1

    # Enrollment
    lines.append(
        f"INSERT INTO public.enrollments "
        f"(id, player_id, campus_id, pricing_plan_id, status, "
        f"start_date, inscription_date, has_scholarship) VALUES ("
        f"'{enrollment_id}', '{player_id}', "
        f"(SELECT id FROM public.campuses WHERE code = {q(campus_code)} LIMIT 1), "
        f"(SELECT id FROM public.pricing_plans WHERE is_active = true LIMIT 1), "
        f"'active', "
        f"'{insc_date.isoformat()}', '{insc_date.isoformat()}', "
        f"{'true' if is_beca else 'false'});"
    )
    stats["enrollments"] += 1
    if is_beca:
        stats["beca"] += 1

    # Team assignment (skip MZO sheets)
    if hoja not in SKIP_HOJAS and team_id:
        ta_id = uid()
        lines.append(
            f"INSERT INTO public.team_assignments "
            f"(id, enrollment_id, team_id, start_date, is_primary, role) VALUES ("
            f"'{ta_id}', '{enrollment_id}', '{team_id}', "
            f"'{insc_date.isoformat()}', true, 'regular');"
        )
    elif hoja in SKIP_HOJAS:
        stats["no_team"] += 1

    # Guardian — mom
    if is_valid_name(nom_mama):
        mama_first, mama_last = split_name(nom_mama)
        phone_m = tel_mama or tel_pref or "N/D"
        gid_m   = uid()
        lines.append(
            f"INSERT INTO public.guardians "
            f"(id, first_name, last_name, phone_primary, email, relationship_label) VALUES ("
            f"'{gid_m}', {q(mama_first)}, {q(mama_last)}, "
            f"{q(phone_m)}, {q(email)}, 'madre');"
        )
        lines.append(
            f"INSERT INTO public.player_guardians "
            f"(id, player_id, guardian_id, is_primary) VALUES ("
            f"'{uid()}', '{player_id}', '{gid_m}', true);"
        )
        stats["guardians"] += 1

    # Guardian — dad
    if is_valid_name(nom_papa):
        papa_first, papa_last = split_name(nom_papa)
        phone_p  = tel_papa or "N/D"
        gid_p    = uid()
        has_mama = is_valid_name(nom_mama)
        lines.append(
            f"INSERT INTO public.guardians "
            f"(id, first_name, last_name, phone_primary, email, relationship_label) VALUES ("
            f"'{gid_p}', {q(papa_first)}, {q(papa_last)}, "
            f"{q(phone_p)}, {q(email)}, 'padre');"
        )
        lines.append(
            f"INSERT INTO public.player_guardians "
            f"(id, player_id, guardian_id, is_primary) VALUES ("
            f"'{uid()}', '{player_id}', '{gid_p}', {'false' if has_mama else 'true'});"
        )
        stats["guardians"] += 1

    # Charges + payments (skip BECA)
    if not is_beca:
        for month_name, col_idx, period_start, period_end in MONTHS:
            val = get(row, col_idx)

            # Skip if player not yet enrolled this month
            if insc_date > period_end:
                continue

            # Determine action
            if is_real_date(val):
                payment_date = parse_date(val)
                create_payment = True
            elif val in ("MES P", "A"):
                payment_date  = None
                create_payment = False
            else:
                # blank, 1900-01-10, or anything unexpected → skip
                continue

            charge_id = uid()
            lines.append(
                f"INSERT INTO public.charges "
                f"(id, enrollment_id, charge_type_id, period_month, "
                f"description, amount, currency, status, due_date) VALUES ("
                f"'{charge_id}', '{enrollment_id}', "
                f"(SELECT id FROM public.charge_types WHERE code = 'monthly_tuition' LIMIT 1), "
                f"'{period_start.isoformat()}', "
                f"'Mensualidad {MONTH_LABEL[month_name]} 2026', "
                f"{TUITION_AMOUNT:.2f}, 'MXN', 'pending', "
                f"'{period_end.isoformat()}');"
            )
            stats["charges"] += 1

            if create_payment:
                pay_id = uid()
                lines.append(
                    f"INSERT INTO public.payments "
                    f"(id, enrollment_id, paid_at, method, amount, currency, "
                    f"status, notes, external_source) VALUES ("
                    f"'{pay_id}', '{enrollment_id}', "
                    f"'{payment_date.isoformat()} 18:00:00+00:00', "
                    f"'other', {TUITION_AMOUNT:.2f}, 'MXN', 'posted', "
                    f"'Importacion historica', 'import');"
                )
                lines.append(
                    f"INSERT INTO public.payment_allocations "
                    f"(id, payment_id, charge_id, amount) VALUES ("
                    f"'{uid()}', '{pay_id}', '{charge_id}', {TUITION_AMOUNT:.2f});"
                )
                stats["payments"]    += 1
                stats["allocations"] += 1

lines += ["", "COMMIT;", ""]

# ── write output ───────────────────────────────────────────────────────────────

with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

# ── summary ────────────────────────────────────────────────────────────────────

print(f"\nOK Written to {OUT_PATH}")
print(f"  Players:           {stats['players']}")
print(f"  Enrollments:       {stats['enrollments']}  (beca: {stats['beca']})")
print(f"  Guardians:         {stats['guardians']}")
print(f"  Charges created:   {stats['charges']}")
print(f"  Payments posted:   {stats['payments']}")
print(f"  Allocations:       {stats['allocations']}")
print(f"  No-team (MZO):     {stats['no_team']}")
print(f"  SQL lines:         {len(lines)}")
