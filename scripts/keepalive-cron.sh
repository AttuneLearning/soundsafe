#!/usr/bin/env bash
# =============================================================================
# Soundsafe — keepalive cron wrapper
# =============================================================================
#
# Thin wrapper around ai_team_config/scripts/team-keepalive.sh with
# Soundsafe-specific arguments baked in. Wire into cron with a single line:
#
#   */15 * * * * /home/adam/github/soundsafe/scripts/keepalive-cron.sh >> /home/adam/.claude/keepalive-fullstack.log 2>&1
#
# Defaults:
#   - Project root: this repo
#   - Team: fullstack
#   - Interval between dev invocations: 3 hours (cron fires every 15 min
#     but the script self-throttles)
#   - Status retention: 7 days
#   - Pause file: ~/.claude/pause-keepalive-fullstack
#   - Dev → QA pairing: ENABLED (--run-qa-after-dev). Each successful
#     Claude fullstack-dev run is followed by a Codex fullstack-qa sweep
#     that processes the fresh handoff, runs gates, and renders a verdict.
#     If dev finds no work or fails, QA is skipped.
#
# To pause:
#   touch ~/.claude/pause-keepalive-fullstack
# To resume:
#   rm ~/.claude/pause-keepalive-fullstack
#
# Override the interval for a specific run:
#   ./scripts/keepalive-cron.sh --interval-hours 1
#
# Dry run (see what the script would do without invoking either CLI):
#   ./scripts/keepalive-cron.sh --dry-run
#
# Disable the QA pairing for a run (dev only):
#   ./scripts/keepalive-cron.sh --no-qa-after-dev
#
# Override the Codex CLI invocation for your version:
#   ./scripts/keepalive-cron.sh --codex-cmd "codex --non-interactive"
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
KEEPALIVE="$PROJECT_ROOT/ai_team_config/scripts/team-keepalive.sh"

if [[ ! -x "$KEEPALIVE" ]]; then
  echo "Error: $KEEPALIVE not found or not executable." >&2
  echo "Make sure the ai_team_config submodule is initialized:" >&2
  echo "  git submodule update --init" >&2
  exit 1
fi

exec "$KEEPALIVE" "$PROJECT_ROOT" fullstack \
  --interval-hours 3 \
  --retention-days 7 \
  --run-qa-after-dev \
  "$@"
