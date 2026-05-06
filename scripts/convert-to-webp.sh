#!/usr/bin/env bash
# WebP-Konvertierung für alle Bilder im Repo
# Originale bleiben liegen (als JPG-Fallback im <picture>-Tag oder zum spaeteren Aufraeumen)
# Voraussetzung: cwebp (Homebrew: brew install webp)
# Aufruf vom Repo-Root: bash scripts/convert-to-webp.sh
# Idempotent: ueberspringt Bilder, deren .webp-Pendant aktueller ist als das Original

set -e
cd "$(dirname "$0")/.."

QUALITY=82
COUNT=0
SAVED=0

if ! command -v cwebp >/dev/null 2>&1; then
  echo "cwebp nicht gefunden. Installation: brew install webp"
  exit 1
fi

while IFS= read -r src; do
  out="${src%.*}.webp"
  if [[ -f "$out" ]] && [[ "$out" -nt "$src" ]]; then
    continue
  fi
  before=$(stat -f%z "$src")
  cwebp -q $QUALITY -quiet "$src" -o "$out"
  after=$(stat -f%z "$out")
  saved=$((before - after))
  pct=$((saved * 100 / before))
  printf "  %-50s  %6dK -> %6dK  (-%2d%%)\n" "$src" $((before/1024)) $((after/1024)) $pct
  COUNT=$((COUNT + 1))
  SAVED=$((SAVED + saved))
done < <(find images img -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) 2>/dev/null)

echo ""
if [[ $COUNT -gt 0 ]]; then
  echo "Fertig: $COUNT Bilder konvertiert, $((SAVED/1024/1024)) MB gespart."
  echo ""
  echo "Naechster Schritt: HTML auf <picture>-Tag umstellen (Mats + Claude zusammen)."
else
  echo "Alle WebPs aktuell - nichts zu tun."
fi
