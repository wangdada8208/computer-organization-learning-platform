#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_KEYS="${HOME}/.ssh/authorized_keys"
DEPLOY_PUB="${ROOT_DIR}/ops/github_deploy_key.pub"
NGINX_FILE="${NGINX_FILE:-/etc/nginx/sites-enabled/jz.wangdada8208.xyz}"

ensure_github_deploy_key() {
  if [[ ! -f "${DEPLOY_PUB}" ]]; then
    echo "skip: missing ${DEPLOY_PUB}"
    return 0
  fi

  mkdir -p "${HOME}/.ssh"
  touch "${AUTH_KEYS}"
  chmod 700 "${HOME}/.ssh"
  chmod 600 "${AUTH_KEYS}"

  local pub_line
  pub_line="$(tr -d '\r\n' < "${DEPLOY_PUB}")"
  if grep -qF "${pub_line}" "${AUTH_KEYS}"; then
    echo "ok: github deploy key already authorized"
  else
    printf '%s\n' "${pub_line}" >> "${AUTH_KEYS}"
    echo "added: github deploy key to authorized_keys"
  fi
}

ensure_jz_cache_rules() {
  if [[ ! -f "${NGINX_FILE}" ]]; then
    echo "skip: nginx config not found at ${NGINX_FILE}"
    return 0
  fi

  NGINX_FILE="${NGINX_FILE}" python3 - <<'PY'
import os
from pathlib import Path

nginx_file = Path(os.environ["NGINX_FILE"])
text = nginx_file.read_text(encoding="utf-8")
changed = False

json_snippet = """
    # --- JSON data: always fresh ---
    location ~* ^/data/.+\\.json$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

"""
json_marker = "    # --- Cache static assets ---"
if "location ~* ^/data/.+\\.json$" not in text and json_marker in text:
    text = text.replace(json_marker, json_snippet + json_marker, 1)
    changed = True
    print("added: nginx json no-cache block")

sw_snippet = """
    # --- service worker (no cache - must be fresh) ---
    location = /sw.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

"""
sw_marker = "    # --- Main HTML ---"
if "location = /sw.js" not in text and sw_marker in text:
    text = text.replace(sw_marker, sw_snippet + sw_marker, 1)
    changed = True
    print("added: nginx sw.js no-cache block")

if changed:
    nginx_file.write_text(text, encoding="utf-8")
else:
    print("ok: nginx cache rules already configured")
PY
}

ensure_github_deploy_key
ensure_jz_cache_rules
