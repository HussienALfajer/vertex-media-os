#!/usr/bin/env bash
# SessionStart hook: fast-forward the local `main` to `origin/main`.
# It never rewrites history, never discards changes and never blocks the session.
# Output (one line, only when something happened) is added to Claude's context.

# `builtin` bypasses shell-profile wrappers around `cd` (for example a Node version manager hook).
builtin cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

if ! git fetch --prune --quiet origin 2>/dev/null; then
  echo "sync-main: could not fetch origin (offline?); local main unchanged."
  exit 0
fi

git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null || exit 0
behind=$(git rev-list --count main..origin/main 2>/dev/null || echo 0)
[ "$behind" = "0" ] && exit 0

if ! git merge-base --is-ancestor main origin/main 2>/dev/null; then
  echo "sync-main: local main has diverged from origin/main; not updated. Resolve it manually."
  exit 0
fi

current=$(git branch --show-current)

if [ "$current" = "main" ]; then
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "sync-main: main is $behind commit(s) behind origin/main but has uncommitted changes; not updated."
    exit 0
  fi
  if git merge --ff-only --quiet origin/main 2>/dev/null; then
    echo "sync-main: main fast-forwarded by $behind commit(s) to $(git rev-parse --short HEAD)."
  else
    echo "sync-main: fast-forward of main failed; main unchanged."
  fi
  exit 0
fi

# Not on main here: move the main ref only if no worktree has main checked out.
if git worktree list --porcelain | grep -qx 'branch refs/heads/main'; then
  echo "sync-main: main is $behind commit(s) behind origin/main; it is checked out in another worktree and is updated when a session starts there."
  exit 0
fi

git update-ref refs/heads/main "$(git rev-parse origin/main)" "$(git rev-parse main)" \
  && echo "sync-main: local main fast-forwarded by $behind commit(s) (current branch: $current)."
exit 0
