#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_KEYS="${HOME}/.ssh/authorized_keys"
DEPLOY_PUB="${ROOT_DIR}/ops/github_deploy_key.pub"
NGINX_FILE="/etc/nginx/sites-enabled/wangdada8208.xyz"

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

ensure_json_no_cache() {
  if [[ ! -f "${NGINX_FILE}" ]]; then
    echo "skip: nginx config not found at ${NGINX_FILE}"
    return 0
  fi

  python3 - <<'PY'
from pathlib import Path

nginx_file = Path("/etc/nginx/sites-enabled/wangdada8208.xyz")
text = nginx_file.read_text(encoding="utf-8")
snippet = """
    # --- JSON data: always fresh ---
    location ~* ^/data/.+\\.json$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

"""
marker = "    # --- Cache-Control for static assets ---"
if "location ~* ^/data/.+\\.json$" in text:
    print("ok: nginx json no-cache already configured")
elif marker in text:
    nginx_file.write_text(text.replace(marker, snippet + marker, 1), encoding="utf-8")
    print("added: nginx json no-cache block")
else:
    raise SystemExit("Cannot find nginx insertion point for json no-cache")
PY
}

ensure_github_deploy_key
ensure_json_no_cache
