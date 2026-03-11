#!/usr/bin/env python3
"""
Generate seed SQL migration from dragonforce_seed.json.
Output: supabase/migrations/20260306000000_seed_real_data.sql
"""

import json
import uuid
from pathlib import Path

INPUT  = r"c:/Users/javig/Downloads/dragonforce_seed.json"
OUTPUT = r"d:/Docs/Porto/Dragon Force Ops/DragonForceOps/supabase/migrations/20260306000000_seed_real_data.sql"

DEFAULT_INSCRIPTION_DATE = "2025-08-01"
TUITION_AMOUNT = 750.00   # All historical monthly charges at regular rate

MONTH_ABBR = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
}

def sq(s):
    """Wrap value in SQL single quotes, escape internal quotes. Return NULL for None."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def sb(b):
    return "true" if b else "false"

with open(INPUT, "r", encoding="utf-8") as f:
    players = json.load(f)

lines = []
beca_notes = []

# ── Header ────────────────────────────────────────────────────────────────────
lines += [
    "-- ================================================================",
    "-- Dragon Force Ops — Real Data Seed",
    "-- Generated: 2026-03-06",
    "-- Source: dragonforce_seed.json",
    f"-- Players: {len(players)}",
    "-- Apply to PREVIEW first, validate, then prod.",
    "-- Idempotent: safe to re-run.",
    "-- BECA/SEL entries listed at bottom — review manually.",
    "-- ================================================================",
    "",
    "SET statement_timeout = '5min';",
    "",
]

# ── 1. Players ────────────────────────────────────────────────────────────────
lines += [
    "-- ── 1. Players ──────────────────────────────────────────────────────────────",
    "INSERT INTO public.players (id, first_name, last_name, birth_date, gender, status)",
    "VALUES",
]
rows = []
for p in players:
    rows.append(
        f"  ({sq(p['player_id'])}, {sq(p['first_name'])}, {sq(p['last_name'])}, "
        f"{sq(p['birth_date'])}, {sq(p.get('gender'))}, 'active')"
    )
lines.append(",\n".join(rows))
lines += ["ON CONFLICT (id) DO NOTHING;", ""]

# ── 2. Guardians ──────────────────────────────────────────────────────────────
seen_guardians = set()
guardian_rows = []
pg_rows = []

for p in players:
    for g in p.get("guardians", []):
        gid = g["guardian_id"]
        if gid not in seen_guardians:
            seen_guardians.add(gid)
            guardian_rows.append(
                f"  ({sq(gid)}, {sq(g.get('first_name'))}, {sq(g.get('last_name'))}, "
                f"{sq(g.get('phone'))}, {sq(g.get('email'))})"
            )
        pg_rows.append(
            f"  ({sq(p['player_id'])}, {sq(gid)}, {sb(g.get('is_primary', False))})"
        )

if guardian_rows:
    lines += [
        "-- ── 2. Guardians ────────────────────────────────────────────────────────────",
        "INSERT INTO public.guardians (id, first_name, last_name, phone_primary, email)",
        "VALUES",
    ]
    lines.append(",\n".join(guardian_rows))
    lines += ["ON CONFLICT (id) DO NOTHING;", ""]

    lines += [
        "-- ── 3. player_guardians ─────────────────────────────────────────────────────",
        "INSERT INTO public.player_guardians (player_id, guardian_id, is_primary)",
        "VALUES",
    ]
    lines.append(",\n".join(pg_rows))
    lines += ["ON CONFLICT (player_id, guardian_id) DO NOTHING;", ""]

# ── 4. Enrollments ────────────────────────────────────────────────────────────
lines += [
    "-- ── 4. Enrollments ──────────────────────────────────────────────────────────",
    "-- campus_id and pricing_plan_id resolved dynamically by code.",
    "-- ON CONFLICT DO NOTHING (no target) handles both id PK and",
    "-- the partial unique index uq_enrollment_one_active_per_player.",
    "INSERT INTO public.enrollments",
    "  (id, player_id, campus_id, pricing_plan_id, status, start_date, inscription_date)",
    "SELECT v.id, v.player_id, c.id, pp.id, 'active', v.start_date::date, v.inscription_date::date",
    "FROM (VALUES",
]
rows = []
for p in players:
    d = p.get("inscription_date") or DEFAULT_INSCRIPTION_DATE
    rows.append(
        f"  ({sq(p['enrollment_id'])}::uuid, {sq(p['player_id'])}::uuid, "
        f"{sq(p['campus_code'])}, {sq(d)}, {sq(d)})"
    )
lines.append(",\n".join(rows))
lines += [
    ") AS v(id, player_id, campus_code, start_date, inscription_date)",
    "JOIN public.campuses c ON c.code = v.campus_code",
    "CROSS JOIN (SELECT id FROM public.pricing_plans WHERE is_active = true LIMIT 1) pp",
    "ON CONFLICT DO NOTHING;",
    "",
]

# ── 5. Charges: Inscription ───────────────────────────────────────────────────
lines += [
    "-- ── 5. Charges: Inscription ─────────────────────────────────────────────────",
    "-- WHERE NOT EXISTS guards idempotency (inscription has no natural unique key).",
    "INSERT INTO public.charges",
    "  (enrollment_id, charge_type_id, description, amount, currency, status)",
    "SELECT v.enrollment_id, ct.id, 'Inscripción', v.amount, 'MXN', 'pending'",
    "FROM (VALUES",
]
rows = []
for p in players:
    amount = p.get("inscription_amount", 1800)
    rows.append(f"  ({sq(p['enrollment_id'])}::uuid, {amount}::numeric)")
lines.append(",\n".join(rows))
lines += [
    ") AS v(enrollment_id, amount)",
    "CROSS JOIN (SELECT id FROM public.charge_types WHERE code = 'inscription') ct",
    "WHERE NOT EXISTS (",
    "  SELECT 1 FROM public.charges c2",
    "  WHERE c2.enrollment_id = v.enrollment_id AND c2.charge_type_id = ct.id",
    ");",
    "",
]

# ── 6. Charges: Monthly Tuition ───────────────────────────────────────────────
monthly_charge_rows = []
payment_rows = []
alloc_rows = []   # (payment_id, enrollment_id, period_month, amount)

for p in players:
    enroll_id = p["enrollment_id"]
    for ym, info in p.get("monthly_payments", {}).items():
        status = info.get("status")
        if status == "absent":
            continue

        period_month = ym + "-01"
        year, month = ym.split("-")
        description = f"Mensualidad {MONTH_ABBR[month]} {year}"

        monthly_charge_rows.append(
            f"  ({sq(enroll_id)}::uuid, {sq(period_month)}::date, {sq(description)})"
        )

        if status == "paid" and info.get("paid_date"):
            pay_id = str(uuid.uuid4())
            paid_at = info["paid_date"] + "T12:00:00Z"
            payment_rows.append(
                f"  ({sq(pay_id)}, {sq(enroll_id)}::uuid, {sq(paid_at)}::timestamptz, "
                f"'other', {TUITION_AMOUNT}::numeric, 'MXN', 'posted')"
            )
            alloc_rows.append(
                f"  ({sq(pay_id)}::uuid, {sq(enroll_id)}::uuid, {sq(period_month)}::date, "
                f"{TUITION_AMOUNT}::numeric)"
            )
        elif status == "beca":
            name = f"{p['first_name']} {p['last_name']}"
            beca_notes.append(f"--   {name} ({p.get('df_ref', '?')}): {ym}")

if monthly_charge_rows:
    lines += [
        "-- ── 6. Charges: Monthly Tuition ─────────────────────────────────────────────",
        "INSERT INTO public.charges",
        "  (enrollment_id, charge_type_id, period_month, description, amount, currency, status)",
        "SELECT v.enrollment_id, ct.id, v.period_month, v.description, 750.00, 'MXN', 'pending'",
        "FROM (VALUES",
    ]
    lines.append(",\n".join(monthly_charge_rows))
    lines += [
        ") AS v(enrollment_id, period_month, description)",
        "CROSS JOIN (SELECT id FROM public.charge_types WHERE code = 'monthly_tuition') ct",
        "ON CONFLICT (enrollment_id, charge_type_id, period_month)",
        "  WHERE period_month IS NOT NULL AND status <> 'void'",
        "DO NOTHING;",
        "",
    ]

# ── 7. Payments ───────────────────────────────────────────────────────────────
if payment_rows:
    lines += [
        "-- ── 7. Payments ─────────────────────────────────────────────────────────────",
        "-- method = 'other': actual collection method unknown for historical data.",
        "-- paid_at = paid_date at 12:00 UTC.",
        "INSERT INTO public.payments",
        "  (id, enrollment_id, paid_at, method, amount, currency, status)",
        "VALUES",
    ]
    lines.append(",\n".join(payment_rows))
    lines += ["ON CONFLICT (id) DO NOTHING;", ""]

# ── 8. Payment Allocations ────────────────────────────────────────────────────
if alloc_rows:
    lines += [
        "-- ── 8. Payment Allocations ──────────────────────────────────────────────────",
        "-- Joins to find the charge id for each (enrollment, period_month) pair.",
        "INSERT INTO public.payment_allocations (payment_id, charge_id, amount)",
        "SELECT v.payment_id, c.id, v.amount",
        "FROM (VALUES",
    ]
    lines.append(",\n".join(alloc_rows))
    lines += [
        ") AS v(payment_id, enrollment_id, period_month, amount)",
        "JOIN public.charges c",
        "  ON c.enrollment_id = v.enrollment_id",
        "  AND c.period_month = v.period_month",
        "  AND c.status <> 'void'",
        "  AND c.charge_type_id = (SELECT id FROM public.charge_types WHERE code = 'monthly_tuition')",
        "ON CONFLICT (payment_id, charge_id) DO NOTHING;",
        "",
    ]

# ── Beca Notes ────────────────────────────────────────────────────────────────
if beca_notes:
    lines += [
        "-- ================================================================",
        "-- BECA / SEL — Manual Review Required",
        "-- Monthly tuition charges for these players+months have been seeded",
        "-- as 'pending'. Review each one and either:",
        "--   a) void the charge (if fully subsidised)",
        "--   b) add a discount credit charge (partial subsidy)",
        "--   c) post a $0 or reduced payment",
        "-- ----------------------------------------------------------------",
    ] + beca_notes + [
        "-- ================================================================",
        "",
    ]

output = "\n".join(lines)
Path(OUTPUT).write_text(output, encoding="utf-8")

print(f"Generated: {OUTPUT}")
print(f"  Players:          {len(players)}")
print(f"  Guardians:        {len(seen_guardians)}")
print(f"  pg_rows:          {len(pg_rows)}")
print(f"  Monthly charges:  {len(monthly_charge_rows)}")
print(f"  Payments:         {len(payment_rows)}")
print(f"  Allocations:      {len(alloc_rows)}")
print(f"  Beca entries:     {len(beca_notes)}")
