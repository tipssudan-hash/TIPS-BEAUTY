#!/usr/bin/env bash
set -euo pipefail

src_dir="$1"
branch="$2"
remote_url="$(git config --get remote.origin.url)"
sha="$(git rev-parse --short HEAD)"
auth_header="$(git config --get http.https://github.com/.extraheader || true)"

if [[ -n "${DEPLOY_REPO:-}" && -n "${DEPLOY_TOKEN:-}" ]]; then
  remote_url="https://x-access-token:${DEPLOY_TOKEN}@github.com/${DEPLOY_REPO}.git"
  auth_header=""
fi

test -f "$src_dir/index.html" || { echo "No index.html in $src_dir" >&2; exit 1; }

work="$(mktemp -d)"
cp -a "$src_dir"/. "$work"/
cd "$work"
git init -q -b "$branch"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "Build from $sha"
git -c "http.https://github.com/.extraheader=$auth_header" push -f "$remote_url" "HEAD:refs/heads/$branch"
