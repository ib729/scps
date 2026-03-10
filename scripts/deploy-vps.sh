#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_NEXT_DIR="$REPO_ROOT/web-next"
BRANCH="${1:-main}"

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy with a dirty working tree on the VPS."
  echo "Commit, stash, or discard local changes first."
  exit 1
fi

git fetch origin

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH" --track "origin/$BRANCH"
  fi
fi

git pull --ff-only origin "$BRANCH"

pnpm --dir "$WEB_NEXT_DIR" install --frozen-lockfile
pnpm --dir "$WEB_NEXT_DIR" build

sudo systemctl restart stuco-web
sudo systemctl --no-pager --full status stuco-web
