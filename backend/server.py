#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from merge import merge_progress_states, normalize_state, now_iso


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = ROOT_DIR / "data" / "coa-sync.db"

ADJECTIVES = ["calm", "bright", "steady", "clear", "swift", "solid", "keen", "bold"]
NOUNS = ["cache", "alu", "bus", "logic", "stack", "byte", "clock", "kernel"]


def make_db_connection(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path):
    os.makedirs(Path(db_path).parent, exist_ok=True)
    conn = make_db_connection(db_path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            auto_generated INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            last_used_at TEXT NOT NULL,
            revoked_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_progress (
            user_id INTEGER PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            client_updated_at TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password, salt_hex=None):
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
    return salt.hex(), digest.hex()


def verify_password(password, salt_hex, digest_hex):
    _, computed = hash_password(password, salt_hex)
    return secrets.compare_digest(computed, digest_hex)


def create_token():
    return "coa_" + secrets.token_urlsafe(32)


def generate_credentials():
    username = f"{secrets.choice(ADJECTIVES)}-{secrets.choice(NOUNS)}-{secrets.randbelow(9000) + 1000}"
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    password = "".join(secrets.choice(alphabet) for _ in range(10))
    return username, password


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "COAAuth/0.1"

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_common_headers()
        self.end_headers()

    def do_GET(self):
        self.dispatch_request("GET")

    def do_POST(self):
        self.dispatch_request("POST")

    def do_PUT(self):
        self.dispatch_request("PUT")

    def dispatch_request(self, method):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        try:
            if route == "/api/health" and method == "GET":
                return self.respond_json({"ok": True, "time": now_iso()})
            if route == "/api/auth/register" and method == "POST":
                return self.handle_register(auto=False)
            if route == "/api/auth/register-auto" and method == "POST":
                return self.handle_register(auto=True)
            if route == "/api/auth/login" and method == "POST":
                return self.handle_login()
            if route == "/api/auth/logout" and method == "POST":
                return self.handle_logout()
            if route == "/api/me" and method == "GET":
                return self.handle_me()
            if route == "/api/progress" and method == "GET":
                return self.handle_get_progress()
            if route == "/api/progress" and method == "PUT":
                return self.handle_put_progress()
            if route == "/api/progress/reset" and method == "POST":
                return self.handle_reset_progress()
            if route == "/api/progress/merge" and method == "POST":
                return self.handle_merge_progress()
            return self.respond_error(HTTPStatus.NOT_FOUND, "接口不存在")
        except ValueError as error:
            return self.respond_error(HTTPStatus.BAD_REQUEST, str(error))
        except PermissionError as error:
            return self.respond_error(HTTPStatus.UNAUTHORIZED, str(error))
        except sqlite3.IntegrityError:
            return self.respond_error(HTTPStatus.CONFLICT, "账号已存在")
        except Exception as error:  # pylint: disable=broad-except
            return self.respond_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"服务内部错误: {error}")

    def handle_register(self, auto):
        payload = self.read_json()
        username = (payload.get("username") or "").strip()
        password = (payload.get("password") or "").strip()
        if auto:
            username, password = self.unique_generated_credentials()
        else:
            self.validate_credentials(username, password)
        created_at = now_iso()
        salt_hex, digest_hex = hash_password(password)
        conn = self.server.db()
        conn.execute(
            "INSERT INTO users (username, password_hash, password_salt, auto_generated, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, digest_hex, salt_hex, 1 if auto else 0, created_at),
        )
        user_id = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
        token = self.issue_token(conn, user_id)
        self.ensure_progress_row(conn, user_id, None)
        conn.commit()
        conn.close()
        data = {
            "token": token,
            "user": {"id": user_id, "username": username, "createdAt": created_at},
        }
        if auto:
            data["generated"] = {"username": username, "password": password}
        return self.respond_json(data, HTTPStatus.CREATED)

    def handle_login(self):
        payload = self.read_json()
        username = (payload.get("username") or "").strip()
        password = (payload.get("password") or "").strip()
        if not username or not password:
            raise ValueError("请输入账号和密码")
        conn = self.server.db()
        row = conn.execute(
            "SELECT id, username, password_hash, password_salt, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not row or not verify_password(password, row["password_salt"], row["password_hash"]):
            conn.close()
            raise PermissionError("账号或密码错误")
        token = self.issue_token(conn, row["id"])
        conn.commit()
        conn.close()
        return self.respond_json(
            {
                "token": token,
                "user": {"id": row["id"], "username": row["username"], "createdAt": row["created_at"]},
            }
        )

    def handle_logout(self):
        token, _user = self.require_auth()
        conn = self.server.db()
        conn.execute("UPDATE auth_tokens SET revoked_at = ? WHERE token = ?", (now_iso(), token))
        conn.commit()
        conn.close()
        return self.respond_json({"ok": True})

    def handle_me(self):
        _token, user = self.require_auth()
        progress = self.get_progress_row(user["id"])
        return self.respond_json(
            {
                "user": user,
                "progressMeta": {
                    "updatedAt": progress["updated_at"] if progress else None,
                    "version": progress["version"] if progress else 0,
                },
            }
        )

    def handle_get_progress(self):
        _token, user = self.require_auth()
        progress = self.get_progress_row(user["id"])
        state = json.loads(progress["state_json"]) if progress else None
        return self.respond_json(
            {
                "state": state,
                "meta": {
                    "updatedAt": progress["updated_at"] if progress else None,
                    "clientUpdatedAt": progress["client_updated_at"] if progress else None,
                    "version": progress["version"] if progress else 0,
                },
            }
        )

    def handle_put_progress(self):
        _token, user = self.require_auth()
        payload = self.read_json()
        state = normalize_state(payload.get("state"))
        meta = self.save_progress(user["id"], state)
        return self.respond_json({"state": state, "meta": meta})

    def handle_merge_progress(self):
        _token, user = self.require_auth()
        payload = self.read_json()
        local_state = normalize_state(payload.get("state"))
        progress = self.get_progress_row(user["id"])
        remote_state = json.loads(progress["state_json"]) if progress else None
        merged = merge_progress_states(local_state, remote_state)
        meta = self.save_progress(user["id"], merged)
        return self.respond_json({"state": merged, "meta": meta})

    def handle_reset_progress(self):
        _token, user = self.require_auth()
        state = normalize_state({})
        meta = self.save_progress(user["id"], state)
        return self.respond_json({"state": state, "meta": meta})

    def unique_generated_credentials(self):
        conn = self.server.db()
        try:
            for _ in range(32):
                username, password = generate_credentials()
                exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
                if not exists:
                    return username, password
        finally:
            conn.close()
        raise ValueError("自动生成账号失败，请重试")

    def save_progress(self, user_id, state):
        conn = self.server.db()
        existing = conn.execute(
            "SELECT version FROM user_progress WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        version = (existing["version"] if existing else 0) + 1
        updated_at = now_iso()
        client_updated_at = state.get("meta", {}).get("updatedAt")
        conn.execute(
            """
            INSERT INTO user_progress (user_id, state_json, updated_at, client_updated_at, version)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                state_json = excluded.state_json,
                updated_at = excluded.updated_at,
                client_updated_at = excluded.client_updated_at,
                version = excluded.version
            """,
            (user_id, json.dumps(state, ensure_ascii=False), updated_at, client_updated_at, version),
        )
        conn.commit()
        conn.close()
        return {"updatedAt": updated_at, "clientUpdatedAt": client_updated_at, "version": version}

    def ensure_progress_row(self, conn, user_id, state):
        initial_state = normalize_state(state or {})
        conn.execute(
            "INSERT OR IGNORE INTO user_progress (user_id, state_json, updated_at, client_updated_at, version) VALUES (?, ?, ?, ?, 1)",
            (user_id, json.dumps(initial_state, ensure_ascii=False), now_iso(), initial_state.get("meta", {}).get("updatedAt")),
        )

    def get_progress_row(self, user_id):
        conn = self.server.db()
        row = conn.execute("SELECT * FROM user_progress WHERE user_id = ?", (user_id,)).fetchone()
        conn.close()
        return row

    def issue_token(self, conn, user_id):
        token = create_token()
        stamp = now_iso()
        conn.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
            (token, user_id, stamp, stamp),
        )
        return token

    def require_auth(self):
        token = self.extract_token()
        if not token:
            raise PermissionError("请先登录")
        conn = self.server.db()
        row = conn.execute(
            """
            SELECT auth_tokens.token, users.id, users.username, users.created_at
            FROM auth_tokens
            JOIN users ON users.id = auth_tokens.user_id
            WHERE auth_tokens.token = ? AND auth_tokens.revoked_at IS NULL
            """,
            (token,),
        ).fetchone()
        if not row:
            conn.close()
            raise PermissionError("登录状态已失效，请重新登录")
        conn.execute("UPDATE auth_tokens SET last_used_at = ? WHERE token = ?", (now_iso(), token))
        conn.commit()
        conn.close()
        user = {"id": row["id"], "username": row["username"], "createdAt": row["created_at"]}
        return token, user

    def extract_token(self):
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header.split(" ", 1)[1].strip()
        return None

    def validate_credentials(self, username, password):
        if not username:
            raise ValueError("账号不能为空")
        if len(username) > 50:
            raise ValueError("账号过长")
        if not password:
            raise ValueError("密码不能为空")
        if len(password) > 100:
            raise ValueError("密码过长")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def respond_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_error(self, status, message):
        self.respond_json({"error": message}, status)

    def _send_common_headers(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Vary", "Origin")

    def log_message(self, fmt, *args):
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{stamp}] {self.address_string()} {fmt % args}")


class ApiServer(ThreadingHTTPServer):
    def __init__(self, address, handler, db_path):
        self.db_path = db_path
        super().__init__(address, handler)

    def db(self):
        return make_db_connection(self.db_path)


def parse_args():
    parser = argparse.ArgumentParser(description="COA auth and sync server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", default=str(DEFAULT_DB))
    return parser.parse_args()


def main():
    args = parse_args()
    init_db(args.db)
    server = ApiServer((args.host, args.port), ApiHandler, args.db)
    print(f"COA auth server listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
