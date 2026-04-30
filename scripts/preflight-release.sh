#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 FocusMCP contributors
# SPDX-License-Identifier: MIT
#
# Pre-flight check before running a release.
# Usage: bash scripts/preflight-release.sh
# Exit 0 if green or warnings only, 1 if hard blockers.

set -uo pipefail

REPO_NAME="$(basename "$PWD")"
REPO_FULL="focus-mcp/$REPO_NAME"

if [[ -t 1 ]]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BLUE=""; RESET=""
fi

ERRORS=0
WARNINGS=0

pass() { echo "${GREEN}PASS${RESET} $1"; }
fail() { echo "${RED}FAIL${RESET} $1"; ERRORS=$((ERRORS+1)); }
warn() { echo "${YELLOW}WARN${RESET} $1"; WARNINGS=$((WARNINGS+1)); }
section() { echo ""; echo "${BLUE}== $1 ==${RESET}"; }

echo "Pre-flight release check — $REPO_NAME"
echo "Started at $(date -Iseconds)"

# 1. Branch + working tree
section "Branch & working tree"
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" == "develop" ]]; then
  pass "On develop branch"
else
  fail "Not on develop (current: $CURRENT_BRANCH)"
fi
if [[ -z "$(git status --porcelain)" ]]; then
  pass "Working tree clean"
else
  fail "Working tree has uncommitted changes"
fi

# 2. Sync with origin
section "Sync with origin"
git fetch --quiet origin develop main 2>/dev/null || true
LOCAL_DEV="$(git rev-parse develop 2>/dev/null || echo '?')"
REMOTE_DEV="$(git rev-parse origin/develop 2>/dev/null || echo '?')"
if [[ "$LOCAL_DEV" == "$REMOTE_DEV" ]]; then
  pass "develop in sync with origin"
else
  fail "develop diverges from origin/develop"
fi

# 3. Divergence main vs develop
section "main vs develop"
MAIN_AHEAD="$(git rev-list --count origin/develop..origin/main 2>/dev/null || echo '?')"
if [[ "$MAIN_AHEAD" == "0" ]]; then
  pass "main not ahead of develop"
elif [[ "$MAIN_AHEAD" =~ ^[0-9]+$ && "$MAIN_AHEAD" -le 5 ]]; then
  warn "main ahead of develop by $MAIN_AHEAD commit(s) — back-merge recommended"
else
  fail "main ahead of develop by $MAIN_AHEAD commits — back-merge required"
fi

# 4. Pending changesets
section "Changesets"
PENDING_FILES=()
while IFS= read -r f; do
  [[ "$(basename "$f")" == "README.md" ]] && continue
  PENDING_FILES+=("$f")
done < <(find .changeset -maxdepth 1 -name "*.md" 2>/dev/null)
PENDING_COUNT=${#PENDING_FILES[@]}
if [[ "$PENDING_COUNT" -eq 0 ]]; then
  warn "No pending changesets — release will be a no-op"
else
  pass "$PENDING_COUNT pending changeset(s)"
  for f in "${PENDING_FILES[@]}"; do
    AGE_S=$(( $(date +%s) - $(stat -c '%Y' "$f" 2>/dev/null || echo 0) ))
    AGE_D=$(( AGE_S / 86400 ))
    if [[ "$AGE_D" -gt 7 ]]; then
      warn "  $(basename "$f") is $AGE_D days old"
    fi
  done
fi

# 5. Last dev-publish CI run
section "CI status"
if command -v gh >/dev/null 2>&1; then
  LAST_CI="$(gh run list --repo "$REPO_FULL" --workflow dev-publish.yml --branch develop --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo '?')"
  case "$LAST_CI" in
    success) pass "Last dev-publish run on develop: SUCCESS" ;;
    failure) fail "Last dev-publish run on develop: FAILURE — fix before release" ;;
    "")      warn "No dev-publish run found on develop" ;;
    *)       warn "Last dev-publish run inconclusive ($LAST_CI)" ;;
  esac
else
  warn "gh CLI not available — skipping CI check"
fi

# 6. Local quality gates
section "Local quality gates"
run_or_fail() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label failed (run \`$*\` to see details)"
  fi
}
run_or_fail "lint"      pnpm -s lint
run_or_fail "typecheck" pnpm -s typecheck
run_or_fail "test"      pnpm -s test
run_or_fail "build"     pnpm -s build

# 7. Dependabot HIGH/CRITICAL
section "Dependabot alerts"
if command -v gh >/dev/null 2>&1; then
  HIGH="$(gh api "/repos/$REPO_FULL/dependabot/alerts?state=open&severity=high" --jq 'length' 2>/dev/null || echo '?')"
  CRIT="$(gh api "/repos/$REPO_FULL/dependabot/alerts?state=open&severity=critical" --jq 'length' 2>/dev/null || echo '?')"
  if [[ "$CRIT" =~ ^[0-9]+$ && "$CRIT" -gt 0 ]]; then
    fail "$CRIT critical Dependabot alert(s) open"
  elif [[ "$HIGH" =~ ^[0-9]+$ && "$HIGH" -gt 0 ]]; then
    warn "$HIGH high Dependabot alert(s) open"
  else
    pass "No HIGH/CRITICAL Dependabot alerts"
  fi
fi

# Summary
section "Summary"
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
if [[ "$ERRORS" -eq 0 ]]; then
  if [[ "$WARNINGS" -eq 0 ]]; then
    echo "${GREEN}All checks passed — ready to release.${RESET}"
  else
    echo "${YELLOW}Warnings only — review then release.${RESET}"
  fi
  exit 0
else
  echo "${RED}Release BLOCKED — fix errors above.${RESET}"
  exit 1
fi
