#!/bin/sh
# PostToolUse hook: after editing a sim or data file, run its paired test suite.
#
# This repo pairs nearly every source file with a suite of the same basename
# (src/data/ckadLabs.js -> src/sims/__tests__/ckadLabs.test.js). The contract
# that every lab's solve() is proven runnable only holds if those suites
# actually run, so run them automatically instead of relying on memory.
#
# Files under src/data/ that carry `docs:` links also trigger the doc-link
# checker (scripts/check-doc-links.mjs), which is otherwise manual.

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0

case "$file" in
  */src/data/*.js|*/src/sims/*.js) ;;
  *) exit 0 ;;
esac

# Editing a test file itself: run that file directly.
case "$file" in
  *.test.js) suite=$file ;;
  *)
    base=$(basename "$file" .js)
    suite=""
    for dir in src/sims/__tests__ src/__tests__; do
      if [ -f "$dir/$base.test.js" ]; then
        suite="$dir/$base.test.js"
        break
      fi
    done
    ;;
esac

status=0

if [ -n "$suite" ]; then
  out=$(npx vitest run "$suite" 2>&1)
  if [ $? -ne 0 ]; then
    printf '%s\n' "$suite failed:" >&2
    printf '%s\n' "$out" | tail -40 >&2
    status=2
  fi
fi

# Doc links live on scenarios, exam tasks and the domain table.
case "$file" in
  */src/data/scenarios.js|*/src/data/examTasks.js|*/src/data/docLinks.js)
    out=$(npm run --silent check:docs 2>&1)
    if [ $? -ne 0 ]; then
      printf '%s\n' "Doc-link check failed:" >&2
      printf '%s\n' "$out" | tail -30 >&2
      status=2
    fi
    ;;
esac

exit $status
