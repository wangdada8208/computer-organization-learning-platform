#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="coa-sync.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
NGINX_FILE="/etc/nginx/sites-enabled/wangdada8208.xyz"
DB_DIR="${ROOT_DIR}/backend/data"

mkdir -p "${DB_DIR}"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=COA Auth and Sync API
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
ExecStart=/usr/bin/python3 ${ROOT_DIR}/backend/server.py --host 127.0.0.1 --port 8765 --db ${ROOT_DIR}/backend/data/coa-sync.db
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
EOF

python3 - <<'PY'
from pathlib import Path

nginx_file = Path("/etc/nginx/sites-enabled/wangdada8208.xyz")
text = nginx_file.read_text(encoding="utf-8")
snippet = """
    # --- API proxy ---
    location /api/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

"""
if "location /api/" not in text:
    marker = "    # --- favicon ---"
    if marker not in text:
        raise SystemExit("Cannot find insertion point in nginx config")
    text = text.replace(marker, snippet + marker, 1)
    nginx_file.write_text(text, encoding="utf-8")
PY

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"
nginx -t
systemctl reload nginx
