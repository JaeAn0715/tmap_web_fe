#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# .env에서 Vite 빌드 변수 로드 (값에 '='가 있으면 첫 '=' 이후 전부 사용)
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
# 프로덕션에서는 브라우저가 접근 가능한 백엔드 URL만. 미설정 시 API 모드 off(로컬스토리지).
API_URL="${FLY_VITE_API_BASE_URL:-$(read_env VITE_API_BASE_URL)}"
if [[ "$API_URL" == http://127.0.0.1* ]] || [[ "$API_URL" == http://localhost* ]]; then
  API_URL=""
fi

exec fly deploy \
  --build-arg "VITE_TMAP_APP_KEY=${TKEY}" \
  --build-arg "VITE_GOOGLE_CLIENT_ID=${GCLIENT}" \
  --build-arg "VITE_API_BASE_URL=${API_URL}"
