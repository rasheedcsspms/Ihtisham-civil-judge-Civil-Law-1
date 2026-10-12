#!/usr/bin/env bash
# Usage: ./build.sh topic1 "Topic 1 - CPC Part I and Civil Courts Ordinance" [kb|qa|all]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$1"; NAME="$2"; WHAT="${3:-all}"
C="$HERE/content/$T"; OUT="$HERE/../Civil Law-I/$NAME"; FIG="$HERE/out/$T/fig"; PDF="$HERE/out/$T/pdf"
mkdir -p "$OUT" "$FIG" "$PDF"
N="${T#topic}"
if [[ "$WHAT" == kb || "$WHAT" == all ]]; then
  node "$HERE/figures.js" "$C/kb_figures.json" "$FIG" >/dev/null
  cat "$C"/kb_*.md > "$HERE/out/$T/kb.md"
  python3 "$HERE/make.py" "$HERE/out/$T/kb.md" "$OUT/Topic $N - Knowledge Base.docx" "$FIG" --pdf "$PDF/kb.pdf"
fi
if [[ "$WHAT" == qa || "$WHAT" == all ]]; then
  node "$HERE/figures.js" "$C/qa_figures.json" "$FIG" >/dev/null
  cat "$C"/qa_*.md > "$HERE/out/$T/qa.md"
  python3 "$HERE/make.py" "$HERE/out/$T/qa.md" "$OUT/Topic $N - Questions and Answers.docx" "$FIG" --pdf "$PDF/qa.pdf"
fi
