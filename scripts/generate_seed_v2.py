"""
generate_seed_v2.py
-------------------
Reads DragonForce_Seed_Final.xlsx - Seed Data.csv and outputs scripts/seed_v2.sql.

Charge / payment logic (critical — matches business model exactly):
  - Every monthly charge is created at $750 EXCEPT the player's true first month
    (period_month == calendar month of enrollment_start_date), which is $600 flat.
  - "absent"  → player not yet enrolled that month → no charge, no payment.
  - "beca"    → scholarship month → no charge, no payment.
  - "unpaid"  → charge created, no payment.
  - paid:
      continuation month, amount=600, payment_date in period month AND day ≤ 10
          → EARLY BIRD: charge $750 + early_bird_discount credit -$150 + payment $600
      otherwise (continuation, amount=750 OR late payment OR non-period month date)
          → charge = paid_amount, payment = paid_amount
      first month
          → charge = paid_amount, payment = paid_amount (no discount credit)

Run from repo root:
    python scripts/generate_seed_v2.py
"""

import csv
import uuid
from datetime import date, datetime
import os

# ── Reference data (live UUIDs from linked Supabase project) ─────────────────
CAMPUS = {
    'LINDA_VISTA': 'bd879be2-40c1-405f-893e-02ede605a927',
    'CONTRY':      '632d04b0-ee85-4604-9af7-703b2dfb8b95',
}
PRICING_PLAN_ID       = 'f89c4e66-641f-4a9f-b617-5608e9c14b5f'
CT_MONTHLY_TUITION    = 'a61f332c-9842-4cf6-b1ee-61231f57f3fe'
CT_EARLY_BIRD         = '10b6cca2-4c55-42dc-b79c-81799811c4b6'

# ── Period definitions ────────────────────────────────────────────────────────
PERIODS = [
    # (key, period_date, due_date, label)
    ('jan', date(2026, 1, 1), date(2026, 1, 31), 'Enero 2026'),
    ('feb', date(2026, 2, 1), date(2026, 2, 28), 'Febrero 2026'),
    ('mar', date(2026, 3, 1), date(2026, 3, 31), 'Marzo 2026'),
]

# ── Column indices (0-based) ──────────────────────────────────────────────────
C_DF_REF      = 0
C_FIRST_NAME  = 1
C_LAST_NAME   = 2
C_BIRTH_DATE  = 3
C_GENDER      = 5
C_CAMPUS      = 6
C_START_DATE  = 7
C_LEVEL       = 8
C_GOALKEEPER  = 9
C_MOM_FIRST   = 10
C_MOM_LAST    = 11
C_MOM_PHONE   = 12
C_MOM_EMAIL   = 13
C_MOM_REL     = 14
C_DAD_FIRST   = 15
C_DAD_LAST    = 16
C_DAD_PHONE   = 17
C_DAD_EMAIL   = 18
C_DAD_REL     = 19
C_JAN_METHOD  = 20
C_JAN_DATE    = 21
C_JAN_AMOUNT  = 22
C_FEB_METHOD  = 23
C_FEB_DATE    = 24
C_FEB_AMOUNT  = 25
C_MAR_METHOD  = 26
C_MAR_DATE    = 27
C_MAR_AMOUNT  = 28

METHOD_COLS = {
    'jan': (C_JAN_METHOD, C_JAN_DATE, C_JAN_AMOUNT),
    'feb': (C_FEB_METHOD, C_FEB_DATE, C_FEB_AMOUNT),
    'mar': (C_MAR_METHOD, C_MAR_DATE, C_MAR_AMOUNT),
}

DEFAULT_START_DATE = date(2024, 1, 1)

CSV_PATH    = os.path.join('docs', 'Reference Docs', 'DragonForce_Seed_Final.xlsx - Seed Data.csv')
OUTPUT_PATH = os.path.join('scripts', 'seed_v2.sql')

# ── Helpers ───────────────────────────────────────────────────────────────────
def uid():
    return str(uuid.uuid4())

def sq(value):
    """Escape a string for SQL single-quote literals. Returns NULL for empty."""
    if value is None or str(value).strip() == '':
        return 'NULL'
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"

def sq_bool(value):
    s = str(value).strip().upper()
    return 'TRUE' if s in ('TRUE', '1', 'YES', 'SI') else 'FALSE'

def parse_date(s):
    s = s.strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except ValueError:
        return None

def guardian_has_data(row, offset):
    """Returns True if the guardian block has at least one non-empty field."""
    return any(row[offset + i].strip() for i in range(5))

def is_early_bird(payment_date, period_date, paid_amount):
    """
    True when: payment_date is in the same calendar month as period_date
               AND payment day is 1–10
               AND paid_amount == 600
    """
    if payment_date is None:
        return False
    return (
        payment_date.year  == period_date.year and
        payment_date.month == period_date.month and
        payment_date.day   <= 10 and
        paid_amount        == 600
    )

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    players_sql     = []
    guardians_sql   = []
    pg_sql          = []   # player_guardians
    enroll_sql      = []
    charges_sql     = []
    payments_sql    = []
    alloc_sql       = []

    skipped = []
    warnings = []
    stats = {'players': 0, 'guardians': 0, 'enrollments': 0,
             'charges': 0, 'discounts': 0, 'payments': 0, 'allocations': 0}

    with open(CSV_PATH, encoding='utf-8', newline='') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Find data rows: any row whose first column starts with 'DF-'
    data_rows = [r for r in rows if r and r[0].strip().startswith('DF-')]
    print(f"Found {len(data_rows)} data rows")

    for row in data_rows:
        df_ref = row[C_DF_REF].strip()

        # Pad row to at least 29 cols
        while len(row) < 29:
            row.append('')

        first_name = row[C_FIRST_NAME].strip()
        last_name  = row[C_LAST_NAME].strip()
        birth_date = row[C_BIRTH_DATE].strip()
        gender     = row[C_GENDER].strip().lower()
        campus_key = row[C_CAMPUS].strip().upper()
        level      = row[C_LEVEL].strip() or None
        goalkeeper = sq_bool(row[C_GOALKEEPER])

        if campus_key not in CAMPUS:
            skipped.append(f"{df_ref}: unknown campus '{campus_key}'")
            continue
        campus_id = CAMPUS[campus_key]

        start_date = parse_date(row[C_START_DATE])
        if start_date is None:
            warnings.append(f"{df_ref}: missing enrollment_start_date, using {DEFAULT_START_DATE}")
            start_date = DEFAULT_START_DATE

        # ── Player ─────────────────────────────────────────────────────────
        player_id = uid()
        stats['players'] += 1
        players_sql.append(
            f"INSERT INTO public.players (id, first_name, last_name, birth_date, gender, status, level, is_goalkeeper) "
            f"VALUES ('{player_id}', {sq(first_name)}, {sq(last_name)}, {sq(birth_date)}, "
            f"{sq(gender)}, 'active', {sq(level)}, {goalkeeper}) "
            f"ON CONFLICT DO NOTHING;"
        )

        # ── Guardians (mom then dad) ────────────────────────────────────────
        guardian_inserts = []
        pg_inserts = []

        mom_data = (row[C_MOM_FIRST], row[C_MOM_LAST], row[C_MOM_PHONE], row[C_MOM_EMAIL], row[C_MOM_REL])
        dad_data = (row[C_DAD_FIRST], row[C_DAD_LAST], row[C_DAD_PHONE], row[C_DAD_EMAIL], row[C_DAD_REL])

        has_mom = any(v.strip() for v in mom_data)
        has_dad = any(v.strip() for v in dad_data)

        # First guardian found = primary
        first_guardian_done = False
        for g_data, g_label in [(mom_data, 'madre'), (dad_data, 'padre')]:
            if not any(v.strip() for v in g_data):
                continue
            g_id = uid()
            stats['guardians'] += 1
            g_first, g_last, g_phone, g_email, g_rel = g_data
            relationship = g_rel.strip() or g_label
            guardian_inserts.append(
                f"INSERT INTO public.guardians (id, first_name, last_name, phone_primary, email, relationship_label) "
                f"VALUES ('{g_id}', {sq(g_first)}, {sq(g_last)}, {sq(g_phone)}, {sq(g_email)}, {sq(relationship)}) "
                f"ON CONFLICT DO NOTHING;"
            )
            is_primary = 'TRUE' if not first_guardian_done else 'FALSE'
            first_guardian_done = True
            pg_inserts.append(
                f"INSERT INTO public.player_guardians (id, player_id, guardian_id, is_primary) "
                f"VALUES ('{uid()}', '{player_id}', '{g_id}', {is_primary}) "
                f"ON CONFLICT DO NOTHING;"
            )

        guardians_sql.extend(guardian_inserts)
        pg_sql.extend(pg_inserts)

        # ── Enrollment ──────────────────────────────────────────────────────
        enrollment_id = uid()
        stats['enrollments'] += 1
        enroll_sql.append(
            f"INSERT INTO public.enrollments (id, player_id, campus_id, pricing_plan_id, status, start_date, inscription_date) "
            f"VALUES ('{enrollment_id}', '{player_id}', '{campus_id}', '{PRICING_PLAN_ID}', "
            f"'active', '{start_date}', '{start_date}') "
            f"ON CONFLICT DO NOTHING;"
        )

        # ── Charges + Payments ──────────────────────────────────────────────
        first_month_period = date(start_date.year, start_date.month, 1) if start_date >= date(2026, 1, 1) else None

        for key, period_date, due_date, label in PERIODS:
            m_col, d_col, a_col = METHOD_COLS[key]
            method_raw  = row[m_col].strip().lower()
            date_raw    = row[d_col].strip()
            amount_raw  = row[a_col].strip()

            # Skip absent and beca months
            if method_raw in ('absent', 'beca', ''):
                continue

            is_first = (first_month_period == period_date)

            # ── Unpaid ─────────────────────────────────────────────────────
            if method_raw == 'unpaid':
                charge_amount = 600 if is_first else 750
                charge_id = uid()
                stats['charges'] += 1
                charges_sql.append(
                    f"INSERT INTO public.charges "
                    f"(id, enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date) "
                    f"VALUES ('{charge_id}', '{enrollment_id}', '{CT_MONTHLY_TUITION}', "
                    f"'{period_date}', 'Mensualidad {label}', {charge_amount}.00, 'MXN', 'pending', '{due_date}') "
                    f"ON CONFLICT DO NOTHING;"
                )
                continue

            # ── Paid ───────────────────────────────────────────────────────
            db_method = {
                'cash': 'cash',
                'stripe_360player': 'stripe_360player',
                'transfer': 'transfer',
            }.get(method_raw)

            if db_method is None:
                warnings.append(f"{df_ref} {key}: unknown method '{method_raw}', skipping")
                continue

            payment_date = parse_date(date_raw)
            if payment_date is None:
                warnings.append(f"{df_ref} {key}: paid but no date, skipping")
                continue

            try:
                paid_amount = int(float(amount_raw))
            except (ValueError, TypeError):
                warnings.append(f"{df_ref} {key}: invalid amount '{amount_raw}', skipping")
                continue

            paid_at = f"{payment_date}T12:00:00+00:00"

            if is_first:
                # ── First month: charge = paid_amount flat, no discount ────
                charge_id = uid()
                stats['charges'] += 1
                charges_sql.append(
                    f"INSERT INTO public.charges "
                    f"(id, enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date) "
                    f"VALUES ('{charge_id}', '{enrollment_id}', '{CT_MONTHLY_TUITION}', "
                    f"'{period_date}', 'Mensualidad {label}', {paid_amount}.00, 'MXN', 'pending', '{due_date}') "
                    f"ON CONFLICT DO NOTHING;"
                )
                payment_id = uid()
                stats['payments'] += 1
                payments_sql.append(
                    f"INSERT INTO public.payments "
                    f"(id, enrollment_id, paid_at, method, amount, currency, status, external_source) "
                    f"VALUES ('{payment_id}', '{enrollment_id}', '{paid_at}', '{db_method}', "
                    f"{paid_amount}.00, 'MXN', 'posted', 'import') "
                    f"ON CONFLICT DO NOTHING;"
                )
                alloc_id = uid()
                stats['allocations'] += 1
                alloc_sql.append(
                    f"INSERT INTO public.payment_allocations (id, payment_id, charge_id, amount) "
                    f"VALUES ('{alloc_id}', '{payment_id}', '{charge_id}', {paid_amount}.00) "
                    f"ON CONFLICT DO NOTHING;"
                )

            elif is_early_bird(payment_date, period_date, paid_amount):
                # ── Early bird: charge $750, discount -$150, payment $600 ──
                charge_id   = uid()
                discount_id = uid()
                payment_id  = uid()
                alloc_id    = uid()
                stats['charges']    += 1
                stats['discounts']  += 1
                stats['payments']   += 1
                stats['allocations']+= 1
                charges_sql.append(
                    f"INSERT INTO public.charges "
                    f"(id, enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date) "
                    f"VALUES ('{charge_id}', '{enrollment_id}', '{CT_MONTHLY_TUITION}', "
                    f"'{period_date}', 'Mensualidad {label}', 750.00, 'MXN', 'pending', '{due_date}') "
                    f"ON CONFLICT DO NOTHING;"
                )
                charges_sql.append(
                    f"INSERT INTO public.charges "
                    f"(id, enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date) "
                    f"VALUES ('{discount_id}', '{enrollment_id}', '{CT_EARLY_BIRD}', "
                    f"'{period_date}', 'Descuento pago anticipado - {label}', -150.00, 'MXN', 'pending', '{due_date}') "
                    f"ON CONFLICT DO NOTHING;"
                )
                payments_sql.append(
                    f"INSERT INTO public.payments "
                    f"(id, enrollment_id, paid_at, method, amount, currency, status, external_source) "
                    f"VALUES ('{payment_id}', '{enrollment_id}', '{paid_at}', '{db_method}', "
                    f"600.00, 'MXN', 'posted', 'import') "
                    f"ON CONFLICT DO NOTHING;"
                )
                alloc_sql.append(
                    f"INSERT INTO public.payment_allocations (id, payment_id, charge_id, amount) "
                    f"VALUES ('{alloc_id}', '{payment_id}', '{charge_id}', 600.00) "
                    f"ON CONFLICT DO NOTHING;"
                )

            else:
                # ── Standard: charge = paid_amount, payment = paid_amount ──
                charge_id  = uid()
                payment_id = uid()
                alloc_id   = uid()
                stats['charges']    += 1
                stats['payments']   += 1
                stats['allocations']+= 1
                charges_sql.append(
                    f"INSERT INTO public.charges "
                    f"(id, enrollment_id, charge_type_id, period_month, description, amount, currency, status, due_date) "
                    f"VALUES ('{charge_id}', '{enrollment_id}', '{CT_MONTHLY_TUITION}', "
                    f"'{period_date}', 'Mensualidad {label}', {paid_amount}.00, 'MXN', 'pending', '{due_date}') "
                    f"ON CONFLICT DO NOTHING;"
                )
                payments_sql.append(
                    f"INSERT INTO public.payments "
                    f"(id, enrollment_id, paid_at, method, amount, currency, status, external_source) "
                    f"VALUES ('{payment_id}', '{enrollment_id}', '{paid_at}', '{db_method}', "
                    f"{paid_amount}.00, 'MXN', 'posted', 'import') "
                    f"ON CONFLICT DO NOTHING;"
                )
                alloc_sql.append(
                    f"INSERT INTO public.payment_allocations (id, payment_id, charge_id, amount) "
                    f"VALUES ('{alloc_id}', '{payment_id}', '{charge_id}', {paid_amount}.00) "
                    f"ON CONFLICT DO NOTHING;"
                )

    # ── Write SQL file ────────────────────────────────────────────────────────
    os.makedirs('scripts', exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write("-- DragonForce Ops — Clean Seed v2\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"-- Players: {stats['players']} | Guardians: {stats['guardians']} | "
                f"Enrollments: {stats['enrollments']}\n")
        f.write(f"-- Charges: {stats['charges']} (incl. {stats['discounts']} early-bird discounts) | "
                f"Payments: {stats['payments']} | Allocations: {stats['allocations']}\n")
        f.write("\nBEGIN;\n\n")

        f.write("-- ── Players ──────────────────────────────────────────────────────────\n")
        f.write('\n'.join(players_sql) + '\n\n')

        f.write("-- ── Guardians ────────────────────────────────────────────────────────\n")
        f.write('\n'.join(guardians_sql) + '\n\n')

        f.write("-- ── Player ↔ Guardian links ──────────────────────────────────────────\n")
        f.write('\n'.join(pg_sql) + '\n\n')

        f.write("-- ── Enrollments ──────────────────────────────────────────────────────\n")
        f.write('\n'.join(enroll_sql) + '\n\n')

        f.write("-- ── Charges (tuition + early-bird discounts) ─────────────────────────\n")
        f.write('\n'.join(charges_sql) + '\n\n')

        f.write("-- ── Payments ─────────────────────────────────────────────────────────\n")
        f.write('\n'.join(payments_sql) + '\n\n')

        f.write("-- ── Payment allocations ──────────────────────────────────────────────\n")
        f.write('\n'.join(alloc_sql) + '\n\n')

        f.write("COMMIT;\n")

    print(f"\nOK Generated {OUTPUT_PATH}")
    print(f"  Players:     {stats['players']}")
    print(f"  Guardians:   {stats['guardians']}")
    print(f"  Enrollments: {stats['enrollments']}")
    print(f"  Charges:     {stats['charges']} ({stats['discounts']} early-bird discounts)")
    print(f"  Payments:    {stats['payments']}")
    print(f"  Allocations: {stats['allocations']}")

    if skipped:
        print(f"\nSKIPPED ({len(skipped)}):")
        for s in skipped:
            print(f"  {s}")

    if warnings:
        print(f"\nWARNINGS ({len(warnings)}):")
        for w in warnings[:20]:
            print(f"  {w}")
        if len(warnings) > 20:
            print(f"  ... and {len(warnings) - 20} more")

if __name__ == '__main__':
    main()
