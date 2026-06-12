#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${1:-/var/www/wangdada8208.xyz}"
MIN_TEACHER_QUESTIONS="${2:-126}"

teacher_file="${DEPLOY_PATH}/data/teacher_quizzes.json"
index_file="${DEPLOY_PATH}/index.html"
app_file="${DEPLOY_PATH}/app.js"

test -f "${teacher_file}"
test -f "${index_file}"
test -f "${app_file}"

teacher_count="$(python3 - <<PY
import json
from pathlib import Path
data = json.loads(Path("${teacher_file}").read_text(encoding="utf-8"))
print(len(data.get("questions", [])))
PY
)"

if (( teacher_count < MIN_TEACHER_QUESTIONS )); then
  echo "teacher quiz count too low: ${teacher_count} < ${MIN_TEACHER_QUESTIONS}" >&2
  exit 1
fi

grep -q 'app.js?v=' "${index_file}"
grep -q 'APP_VERSION' "${app_file}"
grep -q 'DATA_VERSION' "${app_file}"

live_count="$(curl -fsSk -H 'Host: wangdada8208.xyz' 'https://127.0.0.1/data/teacher_quizzes.json' \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("questions", [])))')"

if (( live_count < MIN_TEACHER_QUESTIONS )); then
  echo "live teacher quiz count too low: ${live_count} < ${MIN_TEACHER_QUESTIONS}" >&2
  exit 1
fi

echo "ok: deploy verification passed (${teacher_count} on disk, ${live_count} live)"
