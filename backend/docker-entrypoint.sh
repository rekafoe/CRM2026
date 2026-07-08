#!/bin/sh
set -e

# Chromium/GTK ожидают session bus; в Railway/Docker его нет по умолчанию.
if command -v dbus-daemon >/dev/null 2>&1; then
  mkdir -p /tmp/dbus
  if [ ! -S /tmp/dbus/session ]; then
    dbus-daemon --session --fork --address=unix:path=/tmp/dbus/session --nopidfile
  fi
  export DBUS_SESSION_BUS_ADDRESS="unix:path=/tmp/dbus/session"
fi

unset DBUS_SYSTEM_BUS_ADDRESS

exec "$@"
