#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-report}"

TAILWIND_HARDCODED_PATTERN='\b(bg|text|border|ring|from|to|via|stroke|fill)-(slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|white|black)-'
INLINE_COLOR_PATTERN='#[0-9a-fA-F]{3,8}\b|rgba?\(|oklch\('

echo "== Theme Color Audit =="
echo "Root: $ROOT_DIR"
echo

echo "[1/3] Hardcoded Tailwind color utilities"
HARD=$(rg -n "$TAILWIND_HARDCODED_PATTERN" "$ROOT_DIR/src" --glob '*.tsx' --glob '*.ts' --glob '*.jsx' --glob '*.js' || true)
if [[ -n "$HARD" ]]; then
  echo "$HARD"
else
  echo "None found."
fi

echo
echo "[2/3] Inline color literals in TS/TSX/JS/JSX"
RAW=$(rg -n "$INLINE_COLOR_PATTERN" "$ROOT_DIR/src" --glob '*.tsx' --glob '*.ts' --glob '*.jsx' --glob '*.js' \
  --glob '!src/lib/chart-tokens.ts' || true)
if [[ -n "$RAW" ]]; then
  echo "$RAW"
else
  echo "None found."
fi

echo
echo "[3/3] Summary"
if [[ -z "$HARD" && -z "$RAW" ]]; then
  echo "PASS: no hardcoded page/component colors detected."
  exit 0
fi

echo "FAIL: color hardcoding still present."
if [[ "$MODE" == "check" ]]; then
  exit 1
fi

exit 0
