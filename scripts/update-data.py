#!/usr/bin/env python3
"""Fetch the lcbwiki identity table and write the static app data file.

This intentionally keeps only the fields the picker needs. It does not copy
the wiki's images, skill text, or explanatory prose.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin


SOURCE_URL = "https://wikiwiki.jp/lcbwiki/%3ATemplate/%E4%BA%BA%E6%A0%BC"
SITE_ROOT = "https://wikiwiki.jp/lcbwiki/"


class FirstTableParser(HTMLParser):
    """Collect rows from the first HTML table without third-party packages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.table_depth = 0
        self.first_table: list[list[dict[str, str | None]]] = []
        self.current_table: list[list[dict[str, str | None]]] | None = None
        self.current_row: list[dict[str, str | None]] | None = None
        self.current_cell: dict[str, str | None] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self.table_depth += 1
            if self.table_depth == 1:
                self.current_table = []
            return

        if self.table_depth != 1:
            return

        if tag == "tr":
            self.current_row = []
        elif tag in {"td", "th"}:
            self.current_cell = {"text": "", "href": None}
        elif tag == "br" and self.current_cell is not None:
            self.current_cell["text"] += " "
        elif tag == "a" and self.current_cell is not None:
            href = dict(attrs).get("href")
            if href and not self.current_cell["href"]:
                self.current_cell["href"] = href

    def handle_data(self, data: str) -> None:
        if self.current_cell is not None:
            self.current_cell["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if self.table_depth == 1 and tag in {"td", "th"} and self.current_cell is not None:
            self.current_cell["text"] = re.sub(r"\s+", " ", self.current_cell["text"]).strip()
            if self.current_row is not None:
                self.current_row.append(self.current_cell)
            self.current_cell = None
        elif self.table_depth == 1 and tag == "tr" and self.current_row:
            if self.current_table is not None:
                self.current_table.append(self.current_row)
            self.current_row = None
        elif tag == "table":
            if self.table_depth == 1 and self.current_table is not None and not self.first_table:
                self.first_table = self.current_table
            self.table_depth -= 1


def fetch_html(input_path: Path | None) -> str:
    if input_path:
        return input_path.read_text(encoding="utf-8")

    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "lcb-personality-picker-data-updater/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def season_label(value: str) -> str:
    if value == "0":
        return "恒常"
    if value == "W":
        return "ヴァルプルギスの夜"
    return f"Season {value}"


def parse_personas(html: str) -> list[dict[str, object]]:
    parser = FirstTableParser()
    parser.feed(html)
    personas: list[dict[str, object]] = []

    for row in parser.first_table[1:]:
        if len(row) < 6:
            continue
        identity_id = row[0]["text"] or ""
        if not identity_id.isdigit():
            continue

        name = row[2]["text"] or ""
        sinner = row[3]["text"] or ""
        season = row[4]["text"] or ""
        rarity = row[5]["text"] or ""
        if not name or not sinner or not rarity.isdigit():
            continue

        personas.append(
            {
                "id": identity_id,
                "name": name,
                "sinner": sinner,
                "season": season,
                "seasonLabel": season_label(season),
                "rarity": int(rarity),
                "detailUrl": urljoin(SITE_ROOT, row[2]["href"] or ""),
            }
        )

    if not personas:
        raise RuntimeError("人格一覧を抽出できなかった")
    return personas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="既に取得済みのHTMLを使う")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "personas.js",
    )
    args = parser.parse_args()

    personas = parse_personas(fetch_html(args.input))
    payload = {
        "meta": {
            "sourceUrl": "https://wikiwiki.jp/lcbwiki/%E4%BA%BA%E6%A0%BC",
            "templateUrl": SOURCE_URL,
            "fetchedAt": datetime.now(timezone.utc).date().isoformat(),
            "count": len(personas),
        },
        "personas": personas,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "window.LCB_PERSONA_DATA = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"{len(personas)}件を書き出した: {args.output}")


if __name__ == "__main__":
    main()
