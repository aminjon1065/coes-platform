#!/bin/sh
set -eu

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\\/&|]/\\&/g'
}

SMTP_HOST_ESCAPED="$(escape_sed "${SMTP_HOST:-mailpit}")"
SMTP_PORT_ESCAPED="$(escape_sed "${SMTP_PORT:-1025}")"
SMTP_USERNAME_ESCAPED="$(escape_sed "${SMTP_USERNAME:-}")"
SMTP_PASSWORD_ESCAPED="$(escape_sed "${SMTP_PASSWORD:-}")"

sed \
  -e "s|__SMTP_HOST__|${SMTP_HOST_ESCAPED}|g" \
  -e "s|__SMTP_PORT__|${SMTP_PORT_ESCAPED}|g" \
  -e "s|__SMTP_USERNAME__|${SMTP_USERNAME_ESCAPED}|g" \
  -e "s|__SMTP_PASSWORD__|${SMTP_PASSWORD_ESCAPED}|g" \
  /etc/alertmanager/alertmanager.yml.tmpl > /tmp/alertmanager.yml

exec /bin/alertmanager \
  --config.file=/tmp/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://localhost:9093
