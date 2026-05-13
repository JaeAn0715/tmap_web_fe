#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# .env에서 Vite 빌드 변수 (값에 '='가 있으면 첫 '=' 이후 전부)
read_env() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | sed "s/^${key}=//" | head -1 || true
}

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example" >&2
  exit 1
fi

TKEY="$(read_env VITE_TMAP_APP_KEY)"
GCLIENT="$(read_env VITE_GOOGLE_CLIENT_ID)"

# API URL은 `.env.production`에 고정(https://tmap-web-be.fly.dev).
# 스테이징 등 다른 백엔드면 배포 전에 .env.production 을 수정하거나
# 로컬에서 한 번만 다른 파일로 교체해 빌드하세요.

exec fly deploy \
  --build-arg "VITE_TMAP_APP_KEY=${TKEY}" \
  --build-arg "VITE_GOOGLE_CLIENT_ID=${GCLIENT}"
