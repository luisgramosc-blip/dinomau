#!/usr/bin/env bash
# Pruebas de integración de la base de datos contra un Postgres temporal.
# Requiere los binarios de PostgreSQL ≥ 15 (initdb, pg_ctl, psql) en el PATH
# o en /usr/lib/postgresql/*/bin. No necesita Docker.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=()
# initdb no puede ejecutarse como root
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP"; RUN_AS=(su postgres -c); fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PG_BIN/pg_ctl -D $TMP/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

run "$PG_BIN/initdb -D $TMP/data -A trust -U postgres" >/dev/null
run "$PG_BIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP' -l $TMP/log start" >/dev/null
for _ in $(seq 1 30); do pg_isready -h "$TMP" -p "$PORT" >/dev/null 2>&1 && break; sleep 0.3; done

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f tests/integration/supabase-stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done

DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres?host=$TMP" npx vitest run tests/integration "$@"
