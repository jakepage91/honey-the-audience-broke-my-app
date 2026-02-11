#!/usr/bin/env python3
"""
Seed script for referral_partners table.
Populates 500,000 rows of random referral codes.
Includes one known code: conf-partner-2026

This script is idempotent - it won't insert duplicates if run multiple times.
"""

import os
import random
import string
import sys
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/conference"
)

TOTAL_ROWS = 500_000
BATCH_SIZE = 10_000
KNOWN_CODE = "conf-partner-2026"
KNOWN_NAME = "SREDay Conference Partner"


def generate_random_code(length=20):
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choice(chars) for _ in range(length))


def generate_random_name():
    prefixes = ["Tech", "Cloud", "Data", "Dev", "Ops", "Infra", "Net", "Code", "App", "Web"]
    suffixes = ["Corp", "Labs", "Systems", "Solutions", "Inc", "Co", "Partners", "Group", "Ltd", "LLC"]
    return f"{random.choice(prefixes)}{random.choice(suffixes)}-{random.randint(1000, 9999)}"


def random_date():
    start = datetime(2020, 1, 1)
    end = datetime(2025, 12, 31)
    delta = end - start
    random_days = random.randint(0, delta.days)
    return start + timedelta(days=random_days)


def seed_database():
    print("Connecting to database...")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM referral_partners")
    existing_count = cur.fetchone()[0]

    if existing_count >= TOTAL_ROWS:
        print(f"Database already has {existing_count} rows. Skipping seed.")
        cur.close()
        conn.close()
        return

    if existing_count > 0:
        print(f"Database has {existing_count} rows. Clearing and reseeding...")
        cur.execute("TRUNCATE referral_partners RESTART IDENTITY")
        conn.commit()

    print(f"Seeding {TOTAL_ROWS:,} referral partners...")

    codes_generated = set()
    codes_generated.add(KNOWN_CODE)

    total_inserted = 0

    first_batch = [(KNOWN_CODE, KNOWN_NAME, datetime.now())]

    while len(first_batch) < BATCH_SIZE:
        code = generate_random_code()
        if code not in codes_generated:
            codes_generated.add(code)
            first_batch.append((code, generate_random_name(), random_date()))

    execute_values(
        cur,
        "INSERT INTO referral_partners (code, name, created_at) VALUES %s",
        first_batch,
        template="(%s, %s, %s)"
    )
    conn.commit()
    total_inserted += len(first_batch)
    print(f"  Inserted {total_inserted:,} / {TOTAL_ROWS:,}")

    while total_inserted < TOTAL_ROWS:
        batch = []
        batch_target = min(BATCH_SIZE, TOTAL_ROWS - total_inserted)

        while len(batch) < batch_target:
            code = generate_random_code()
            if code not in codes_generated:
                codes_generated.add(code)
                batch.append((code, generate_random_name(), random_date()))

        execute_values(
            cur,
            "INSERT INTO referral_partners (code, name, created_at) VALUES %s",
            batch,
            template="(%s, %s, %s)"
        )
        conn.commit()
        total_inserted += len(batch)
        print(f"  Inserted {total_inserted:,} / {TOTAL_ROWS:,}")

    cur.execute("SELECT COUNT(*) FROM referral_partners")
    final_count = cur.fetchone()[0]
    print(f"Seeding complete. Total rows: {final_count:,}")

    cur.execute("SELECT code FROM referral_partners WHERE code = %s", (KNOWN_CODE,))
    if cur.fetchone():
        print(f"Known code '{KNOWN_CODE}' verified in database.")
    else:
        print(f"WARNING: Known code '{KNOWN_CODE}' not found!")

    cur.close()
    conn.close()


if __name__ == "__main__":
    try:
        seed_database()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
