#!/usr/bin/env python3
"""
Generate docs/API_REFERENCE.md from the FastAPI OpenAPI schema.

Usage (from repo root):
    cd backend
    python scripts/generate_api_docs.py
"""
import json
import sys
import textwrap
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import app  # noqa: E402


def _method_badge(method: str) -> str:
    colors = {
        "get": "GET",
        "post": "POST",
        "put": "PUT",
        "patch": "PATCH",
        "delete": "DELETE",
    }
    return f"`{colors.get(method.lower(), method.upper())}`"


def _status_table(responses: dict) -> str:
    rows = []
    for code, info in sorted(responses.items()):
        desc = info.get("description", "")
        rows.append(f"| {code} | {desc} |")
    if not rows:
        return ""
    header = "| Status | Description |\n|--------|-------------|"
    return header + "\n" + "\n".join(rows)


def _params_table(params: list) -> str:
    if not params:
        return ""
    rows = []
    for p in params:
        name = p.get("name", "")
        loc = p.get("in", "")
        required = "✓" if p.get("required") else ""
        schema = p.get("schema", {})
        ptype = schema.get("type", "")
        desc = p.get("description", "")
        rows.append(f"| `{name}` | {loc} | {ptype} | {required} | {desc} |")
    header = "| Parameter | In | Type | Required | Description |\n|-----------|----|----|----------|-------------|"
    return header + "\n" + "\n".join(rows)


def generate_markdown(schema: dict) -> str:
    info = schema.get("info", {})
    lines = [
        f"# {info.get('title', 'API Reference')}",
        "",
        f"**Version:** {info.get('version', '')}",
        "",
        info.get("description", "").strip(),
        "",
        "---",
        "",
        "## Endpoints",
        "",
    ]

    tags_order = [t["name"] for t in schema.get("tags", [])]
    paths = schema.get("paths", {})

    # Group by tag
    by_tag: dict[str, list] = {}
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method not in ("get", "post", "put", "patch", "delete"):
                continue
            tags = operation.get("tags", ["other"])
            for tag in tags:
                by_tag.setdefault(tag, []).append((method, path, operation))

    for tag in tags_order:
        endpoints = by_tag.get(tag, [])
        if not endpoints:
            continue
        # Tag description
        tag_desc = next(
            (t.get("description", "") for t in schema.get("tags", []) if t["name"] == tag),
            "",
        )
        lines.append(f"## {tag.capitalize()}")
        if tag_desc:
            lines.append(f"\n{tag_desc}")
        lines.append("")

        for method, path, op in endpoints:
            summary = op.get("summary", path)
            description = op.get("description", "").strip()
            params = op.get("parameters", [])
            responses = op.get("responses", {})

            lines.append(f"### {_method_badge(method)} `{path}`")
            lines.append("")
            lines.append(f"**{summary}**")
            lines.append("")
            if description:
                lines.append(description)
                lines.append("")

            params_md = _params_table(params)
            if params_md:
                lines.append("**Parameters:**")
                lines.append("")
                lines.append(params_md)
                lines.append("")

            status_md = _status_table(responses)
            if status_md:
                lines.append("**Responses:**")
                lines.append("")
                lines.append(status_md)
                lines.append("")

            lines.append("---")
            lines.append("")

    return "\n".join(lines)


def main():
    schema = app.openapi()
    md = generate_markdown(schema)

    out_path = Path(__file__).parent.parent.parent / "docs" / "API_REFERENCE.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    print(f"✓ Generated {out_path}")

    # Also dump the raw OpenAPI JSON
    json_path = Path(__file__).parent.parent.parent / "docs" / "openapi.json"
    json_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ Generated {json_path}")


if __name__ == "__main__":
    main()
