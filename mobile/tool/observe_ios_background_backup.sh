#!/usr/bin/env bash
set -euo pipefail

# Observe iOS background backup activity on a connected device.
#
# Healthy pattern:
# - "for client de.opennoodle.gallery completed successfully"
# - upload responses continue past the first 100 assets (bounded batches refill)
# - when "has 0 outstanding tasks" appears while the app still reports remaining
#   candidates, another Noodle batch is enqueued WITHOUT opening backup details
# - no Noodle "completed with error", "Delayed or retried enqueue failed",
#   abort, or crash lines
#
# Usage: tool/observe_ios_background_backup.sh <device-udid> [seconds]
# Requires: idevicesyslog (libimobiledevice) and rg (ripgrep) on PATH.

UDID="${1:?usage: $0 <device-udid> [seconds]}"
SECONDS_TO_RUN="${2:-180}"

timeout "${SECONDS_TO_RUN}s" idevicesyslog -u "$UDID" -p "Noodle Gallery|nsurlsessiond" --no-colors \
  | rg -i "de\.opennoodle\.gallery|bundle id: de\.opennoodle\.gallery|Noodle Gallery\(background_downloader\)|for client de\.opennoodle\.gallery completed successfully|NDSession .* has [0-9]+ outstanding tasks|Delayed or retried enqueue failed|completed with error|abort|crash"
