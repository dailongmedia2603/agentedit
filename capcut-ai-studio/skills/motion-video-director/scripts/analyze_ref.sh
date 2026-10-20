#!/usr/bin/env bash
# Compatibility: analyze_ref.sh ref.mp4 [outdir]; flags are handled by analyze_ref.py.
set -e
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)' >/dev/null 2>&1; then PY="$candidate"; break; fi
done
if [ -z "$PY" ]; then echo "A working Python 3.10+ interpreter is required; select one or install with permission." >&2; exit 1; fi
if [ "$#" -eq 2 ] && [[ "$2" != --* ]]; then exec "$PY" "$HERE/analyze_ref.py" "$1" --out "$2"; fi
exec "$PY" "$HERE/analyze_ref.py" "$@"
