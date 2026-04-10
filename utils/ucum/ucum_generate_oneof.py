#!/usr/bin/env python3
"""
Generate a JSON Schema oneOf list from a UCUM CSV file.

Usage:
  python utils/ucum/generate_oneof.py ucum-common-units.csv > ucum-oneof.json
  python utils/ucum/generate_oneof.py ucum-common-units.csv --output ucum-oneof.json

UCUM repository:  https://github.com/ucum-org/ucum.git/
Common UCUM units file: common-units/TableOfExampleUcumCodesForElectronicMessaging.xlsx
"""

import argparse
import csv
import json
import sys


def normalize_description(text):
    return " ".join(text.split())


def load_units(csv_path):
    items = []
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for index, row in enumerate(reader):
            if not row:
                continue

            if index == 0 and row[0].strip().upper() == "UCUM_CODE":
                continue

            if len(row) < 2:
                continue

            code = row[0].strip()
            description = ",".join(row[1:]).strip()
            if not code or not description:
                continue

            title = normalize_description(description)

            items.append(
                {
                    "title": f"{title}: {code}",
                    "const": code,
                }
            )

    return items


def main():
    parser = argparse.ArgumentParser(
        description="Generate a JSON Schema oneOf list from UCUM CSV",
    )
    parser.add_argument("csv_path", help="Path to UCUM common units CSV file")
    parser.add_argument(
        "--output",
        help="Write output JSON to this file (defaults to stdout)",
    )
    args = parser.parse_args()

    items = load_units(args.csv_path)
    payload = {"oneOf": items}

    output_text = json.dumps(payload, indent=2, ensure_ascii=True)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(output_text)
            handle.write("\n")
    else:
        sys.stdout.write(output_text)
        sys.stdout.write("\n")


if __name__ == "__main__":
    main()
