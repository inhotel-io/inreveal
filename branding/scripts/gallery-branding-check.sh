#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_ROOT=""
CHECK_WORKTREE=""

# Every check below runs with cwd inside the disposable worktree, and every
# branding script resolves its own REPO_ROOT from ${BASH_SOURCE[0]} — so the
# active checkout is structurally out of reach and only needs tearing down.
cleanup() {
  local status=$?
  set +e

  if [[ -n "$CHECK_WORKTREE" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$CHECK_WORKTREE" >/dev/null 2>&1
  fi
  if [[ -n "$TMP_ROOT" ]]; then
    rm -rf "$TMP_ROOT"
  fi

  exit "$status"
}
trap cleanup EXIT

if [[ "$(uname)" == "Darwin" ]]; then
  export PATH="/opt/homebrew/opt/gnu-sed/libexec/gnubin:/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
fi

TMP_ROOT="$(mktemp -d)"
CHECK_WORKTREE="$TMP_ROOT/worktree"

echo "=== Gallery branding check ==="
echo "Creating temporary worktree at $CHECK_WORKTREE"
git -C "$REPO_ROOT" worktree add --quiet --detach "$CHECK_WORKTREE" HEAD

cd "$CHECK_WORKTREE"

echo "--- Checking branding action dependencies ---"
grep -q 'packages+=(imagemagick)' .github/actions/apply-branding/action.yml ||
  { echo "ERROR: apply-branding no longer installs imagemagick (verify-mobile-assets.sh needs identify)" >&2; exit 1; }

echo "--- Checking email branding transform ---"
branding/scripts/test-email-branding.sh

echo "--- Checking app download branding transform ---"
branding/scripts/test-app-download-branding.sh

echo "--- Checking i18n branding overrides (issues #703, #672) ---"
branding/scripts/test-i18n-branding.sh

echo "--- Checking OAuth mobile callback branding (dual-scheme regression) ---"
branding/scripts/test-oauth-callback-branding.sh

echo "--- Applying branding overlay ---"
branding/scripts/apply-branding.sh

echo "--- Verifying applied branding ---"
branding/scripts/verify-branding.sh

echo "=== Gallery branding check passed ==="
