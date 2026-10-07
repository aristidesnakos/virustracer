#!/bin/bash
# Installs (or with --uninstall removes) the Mac job that reads EODY's weekly West Nile
# report into outbreakfiles.com; see scripts/mac/west-nile-updater.sh for why it runs here.
#
#   scripts/mac/install-west-nile-updater.sh             install or update, then load
#   scripts/mac/install-west-nile-updater.sh --uninstall stop and remove
#
# Installs ~/.local/bin/outbreakfiles-west-nile and
# ~/Library/LaunchAgents/local.outbreakfiles-west-nile.plist; logs to
# ~/Library/Logs/outbreakfiles-west-nile.log. Runs at 09:30 and 21:30 local time (EODY
# posts its report on Wednesday or Thursday evening, Athens time); a run missed while the
# Mac slept happens when it wakes. Needs node 22, git, pdftotext (brew install poppler)
# and gh, signed in.

set -euo pipefail

LABEL="local.outbreakfiles-west-nile"
BIN="$HOME/.local/bin/outbreakfiles-west-nile"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/outbreakfiles-west-nile.log"
DOMAIN="gui/$(id -u)"
HERE="$(cd "$(dirname "$0")" && pwd)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST" "$BIN"
  echo "Removed $LABEL (the log stays at $LOG)."
  exit 0
fi

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found on PATH" >&2; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || { echo "node 22+ needed ($NODE)" >&2; exit 1; }
for tool in git pdftotext gh; do
  command -v "$tool" >/dev/null || { echo "$tool not found on PATH" >&2; exit 1; }
done

mkdir -p "$(dirname "$BIN")" "$(dirname "$PLIST")" "$(dirname "$LOG")"
sed "s|__NODE__|$NODE|" "$HERE/west-nile-updater.sh" >"$BIN"
chmod 755 "$BIN"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Twice a day: EODY's weekly West Nile report into outbreakfiles.com (source: virustracer/scripts/mac/). -->
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$BIN</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>21</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>$LOG</string>
    <key>StandardErrorPath</key>
    <string>$LOG</string>
    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Installed $LABEL: runs at 09:30 and 21:30, logs to $LOG."
echo "Run it now with: launchctl kickstart $DOMAIN/$LABEL"
