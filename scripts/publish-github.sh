#!/usr/bin/env bash
# Safely import all PressForge v0.2.0 sources into the EXISTING public repository.
# Preserves GitHub repository history; never uses force-push.
set -euo pipefail

REPO='yasinsoysal05/pressforge'
VERSION='0.2.0'
TAG="v${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v git >/dev/null || { echo 'Git is required.' >&2; exit 1; }
command -v gh >/dev/null || { echo 'GitHub CLI is required: https://cli.github.com' >&2; exit 1; }
command -v rsync >/dev/null || { echo 'rsync is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required.' >&2; exit 1; }

gh auth status >/dev/null || { echo 'Run: gh auth login' >&2; exit 1; }
python3 "$ROOT/scripts/check-version.py"
python3 "$ROOT/scripts/verify-project.py"

# Clone instead of initializing a separate Git history. This avoids non-fast-forward errors.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pressforge-publish.XXXXXXXX")"
trap 'rm -rf "$WORK"' EXIT

gh repo view "$REPO" --json nameWithOwner --jq '.nameWithOwner' | grep -qx "$REPO" || { echo "Repo not accessible: $REPO" >&2; exit 1; }
gh repo clone "$REPO" "$WORK/repo" -- --branch main

# Never copy local secrets, compiled assets or Git metadata.
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  --exclude='.env' --exclude='.env.*' \
  --exclude='node_modules/' --exclude='dist/' \
  --exclude='target/' --exclude='gen/' \
  --exclude='*.log' \
  --exclude='src-tauri/resources/runtime/***' \
  "$ROOT/" "$WORK/repo/"
# Keep runtime placeholder tracked: the runtime itself is not committed.
mkdir -p "$WORK/repo/src-tauri/resources/runtime"
cp "$ROOT/src-tauri/resources/runtime/README.txt" "$WORK/repo/src-tauri/resources/runtime/README.txt"

cd "$WORK/repo"
git diff --stat || true
git status --short
read -rp 'Publish the inspected source changes to main? [y/N] ' answer
[[ "$answer" == 'y' || "$answer" == 'Y' ]] || { echo 'Cancelled safely.'; exit 1; }

git add -A
if ! git diff --cached --quiet; then
  git commit -m "feat: import PressForge ${TAG} alpha source preview"
  git push origin HEAD:main
fi

if git rev-parse --verify -q "refs/tags/${TAG}" >/dev/null || gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "Tag or release ${TAG} already exists: refusing to overwrite it." >&2
  exit 1
fi

git tag -a "$TAG" -m "PressForge ${VERSION} - alpha source preview"
git push origin "$TAG"
mkdir -p dist
git archive --format=zip --prefix="PressForge-${TAG}/" -o "dist/PressForge-${TAG}-source.zip" "$TAG"

gh release create "$TAG" "dist/PressForge-${TAG}-source.zip" \
  -R "$REPO" \
  --title "PressForge ${TAG} — Alpha Source Preview" \
  --notes-file 'docs/RELEASE-NOTES-v0.2.0.md' \
  --prerelease

printf '\nOK: https://github.com/%s\n' "$REPO"
printf 'Release: https://github.com/%s/releases/tag/%s\n' "$REPO" "$TAG"
