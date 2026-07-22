#!/usr/bin/env bash
# Point the whole app (web + both voice relays) at one public origin by
# writing PUBLIC_ORIGIN and the derived NEXT_PUBLIC_* URLs into .env.
#
# Usage: scripts/set-public-origin.sh https://your-domain-or-ngrok-url
#
# After running this, rebuild and restart so the new values take effect:
#   docker compose build web
#   docker compose up -d web nginx
#
# Requires nginx.conf's path-based routing (/ws/voice, /ws/openai-voice) to
# actually be in front of the app — i.e. docker-compose.yml's `nginx` service.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <https://your-domain-or-ngrok-url>" >&2
  exit 1
fi

origin="${1%/}"

case "$origin" in
  https://*) ws_origin="wss://${origin#https://}" ;;
  http://*)  ws_origin="ws://${origin#http://}" ;;
  *)
    echo "Origin must start with http:// or https://" >&2
    exit 1
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$script_dir/../.env"

if [ ! -f "$env_file" ]; then
  echo ".env not found at $env_file (copy .env.example to .env first)" >&2
  exit 1
fi

set_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    echo "${key}=${value}" >> "$env_file"
  fi
}

set_var "PUBLIC_ORIGIN" "$origin"
set_var "NEXT_PUBLIC_APP_URL" "$origin"
set_var "NEXT_PUBLIC_VOICE_RELAY_URL" "${ws_origin}/ws/voice"
set_var "NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL" "${ws_origin}/ws/openai-voice"

echo "Updated $env_file:"
grep -E "^(PUBLIC_ORIGIN|NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_VOICE_RELAY_URL|NEXT_PUBLIC_OPENAI_VOICE_RELAY_URL)=" "$env_file"
