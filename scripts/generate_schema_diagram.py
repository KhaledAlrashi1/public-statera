#!/usr/bin/env python3
"""Generate a schema diagram and relationship notes from SQLAlchemy metadata."""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import html
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import backend.models  # noqa: F401  # Ensure model tables are registered.
from backend import db

DOCS_DIR = ROOT / "docs"
DOT_PATH = DOCS_DIR / "schema.dot"
PNG_PATH = DOCS_DIR / "schema.png"
MARKDOWN_PATH = DOCS_DIR / "schema.md"


def _column_flags(column) -> str:
    flags: list[str] = []
    if column.primary_key:
        flags.append("PK")
    if column.foreign_keys:
        flags.append("FK")
    if not column.nullable and not column.primary_key:
        flags.append("NOT NULL")
    return " ".join(flags)


def _column_type(column) -> str:
    return str(column.type).replace("<", "&lt;").replace(">", "&gt;")


def _table_label(table) -> str:
    rows = [
        '<tr><td bgcolor="#1f2937" align="left"><font color="white"><b>{}</b></font></td></tr>'.format(
            html.escape(table.name)
        )
    ]
    for column in table.columns:
        pieces = [html.escape(column.name), _column_type(column)]
        flags = _column_flags(column)
        if flags:
            pieces.append(flags)
        rows.append(
            '<tr><td align="left" port="{port}">{text}</td></tr>'.format(
                port=html.escape(column.name),
                text=html.escape(" - ".join(pieces)),
            )
        )
    return "<<table border='0' cellborder='1' cellspacing='0'>{}</table>>".format("".join(rows))


def _relationship_rows(metadata) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        for column in table.columns:
            for foreign_key in sorted(column.foreign_keys, key=lambda item: item.target_fullname):
                target_column = foreign_key.column
                rows.append(
                    {
                        "source_table": table.name,
                        "source_column": column.name,
                        "target_table": target_column.table.name,
                        "target_column": target_column.name,
                        "required": "required" if not column.nullable else "optional",
                    }
                )
    return rows


def write_dot() -> list[dict[str, str]]:
    metadata = db.metadata
    relationships = _relationship_rows(metadata)

    lines = [
        "digraph schema {",
        '  graph [rankdir=LR, splines=true, overlap=false, nodesep=0.45, ranksep=0.9];',
        '  node [shape=plain, fontname="IBM Plex Mono"];',
        '  edge [color="#6b7280", arrowsize=0.7, penwidth=1.1, fontname="IBM Plex Mono", fontsize=10];',
    ]

    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        lines.append(f'  "{table.name}" [label={_table_label(table)}];')

    for relation in relationships:
        lines.append(
            '  "{source_table}":"{source_column}" -> "{target_table}":"{target_column}" [label="{required}"];'.format(
                **relation
            )
        )

    lines.append("}")
    DOT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return relationships


def write_markdown(relationships: list[dict[str, str]]) -> None:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for relation in relationships:
        grouped[relation["source_table"]].append(relation)

    table_count = len(db.metadata.tables)
    relationship_count = len(relationships)

    lines = [
        "# Database Schema",
        "",
        "Generated from SQLAlchemy metadata via `scripts/generate_schema_diagram.py`.",
        "",
        f"- Tables: {table_count}",
        f"- Foreign-key relationships: {relationship_count}",
        "",
        "![Schema diagram](schema.png)",
        "",
        "## Relationship annotations",
        "",
    ]

    for source_table in sorted(grouped):
        lines.append(f"### `{source_table}`")
        lines.append("")
        for relation in grouped[source_table]:
            lines.append(
                "- `{source_table}.{source_column}` -> `{target_table}.{target_column}` ({required})".format(
                    **relation
                )
            )
        lines.append("")

    MARKDOWN_PATH.write_text("\n".join(lines), encoding="utf-8")


def render_png() -> None:
    subprocess.run(
        ["dot", "-Tpng", str(DOT_PATH), "-o", str(PNG_PATH)],
        check=True,
    )


def main() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    relationships = write_dot()
    render_png()
    write_markdown(relationships)
    print(PNG_PATH)
    print(MARKDOWN_PATH)


if __name__ == "__main__":
    main()
