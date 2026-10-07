#!/bin/bash
# Reads EODY's weekly West Nile virus report into outbreakfiles.com, from this Mac.
#
# Why a Mac: EODY answers GitHub Actions runners with HTTP 403 (it blocks their
# datacenter addresses), so .github/workflows/update-west-nile.yml cannot fetch the
# report. This job runs the same updater (scripts/update-toll.mjs) from here instead.
#
# Each run works in a throwaway sparse clone (scripts/ and the West Nile data only) in a
# temp folder, never in ~/Documents/virustracer, so uncommitted work there is never
# touched or swept into a commit. It commits and pushes when a new report was stored, or
# at most once a day to refresh "last checked". When EODY has published nothing for more
# than 21 days (the season is over) it opens one GitHub issue, shows a notification and
# unloads itself.
#
# Installed by scripts/mac/install-west-nile-updater.sh, which fills in NODE below.
# Usage: west-nile-updater [--dry-run]   (--dry-run: no push, no issue, no unload)

set -euo pipefail

REPO="aristidesnakos/virustracer"
SLUG="west-nile-greece-2026"
LABEL="local.outbreakfiles-west-nile"
NODE="__NODE__"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

export PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

work="$(mktemp -d -t outbreakfiles-wnv)"
trap 'rm -rf "$work"' EXIT

season_over=false
last_report=""
for attempt in 1 2 3; do
  rm -rf "$work/repo"
  git clone --quiet --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" "$work/repo"
  cd "$work/repo"
  git sparse-checkout set scripts "data/outbreaks/$SLUG" data/raw/report

  : >"$work/out"
  GITHUB_OUTPUT="$work/out" "$NODE" scripts/update-toll.mjs --outbreak="$SLUG"
  season_over="$(sed -n 's/^season_over=//p' "$work/out" | tail -1)"
  last_report="$(sed -n 's/^last_report=//p' "$work/out" | tail -1)"

  # "readings" when the snapshots changed; "checked" when only lastChecked did and the
  # committed one is over a day old; "none" otherwise (no commit, no redeploy).
  change="$(
    git show "HEAD:data/outbreaks/$SLUG/toll.json" | "$NODE" -e '
      const fs = require("fs");
      const before = JSON.parse(fs.readFileSync(0, "utf8"));
      const after = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const same = JSON.stringify(before.snapshots) === JSON.stringify(after.snapshots);
      const age = Date.now() - Date.parse(before.lastChecked || 0);
      console.log(!same ? "readings" : age > 24 * 3600e3 ? "checked" : "none");
    ' "data/outbreaks/$SLUG/toll.json"
  )"
  if [ "$change" = none ]; then
    log "No new report; nothing to commit."
    break
  fi

  git add -- "data/outbreaks/$SLUG" data/raw/report
  if [ "$change" = readings ]; then
    git commit --quiet -m "data: update West Nile Greece report [skip ci]"
  else
    git commit --quiet -m "data: West Nile Greece last checked [skip ci]"
  fi
  if [ "$DRY_RUN" = 1 ]; then
    log "Dry run: would push ($change)."
    git --no-pager show --stat --oneline HEAD | head -20
    break
  fi
  if git push --quiet origin HEAD:main; then
    log "Pushed ($change)."
    break
  fi
  # Someone pushed in between (the data bot commits twice a day): start again from a fresh clone.
  log "Push rejected (attempt $attempt); retrying from a fresh clone."
  cd "$work"
  [ "$attempt" = 3 ] && { log "Giving up until the next run."; exit 1; }
done

if [ "$season_over" = true ]; then
  title="West Nile Greece 2026: EODY reports have stopped"
  log "Season over (last report $last_report)."
  if [ "$DRY_RUN" = 1 ]; then
    log "Dry run: would open the issue \"$title\" and unload $LABEL."
    exit 0
  fi
  if [ -z "$(gh issue list -R "$REPO" --state open --search "in:title \"$title\"" --json number --jq '.[].number')" ]; then
    gh issue create -R "$REPO" --title "$title" --body "The newest EODY weekly West Nile virus report runs to $last_report, and no new report has been published for more than 21 days, so the 2026 season looks over.

The Mac job \`$LABEL\` has unloaded itself. To finish:
- set \`status\` to \`over\` (or \`waning\`) in \`src/data/outbreaks/west-nile-greece-2026.ts\` and \`scripts/lib/outbreak-registry.mjs\`, and update its summary;
- remove the job for good with \`scripts/mac/install-west-nile-updater.sh --uninstall\` (or reload it if reports resume)."
  fi
  osascript -e "display notification \"No new report since $last_report. Job stopped; see the GitHub issue.\" with title \"Outbreak Files: West Nile season over\"" || true
  launchctl bootout "gui/$(id -u)/$LABEL" || true
fi
