#!/usr/bin/env bash
set -euo pipefail

# Repo bootstrap: run once after cloning / after creating the GitHub repo.
# Idempotent — safe to re-run.

cd "$(dirname "$0")/.."

NAME=$(node -p "require('./package.json').name")
DESC=$(node -p "require('./package.json').description")
KEYWORDS=$(node -p "require('./package.json').keywords.join(',')")

echo "== bun install =="
bun install

echo "== gh: description + topics =="
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh repo edit --description "$DESC"
  gh repo edit --add-topic "$KEYWORDS"
else
  echo "skipped — gh not installed or not authenticated"
fi

echo "== gh: issue labels =="
LABELS=(
  "type:bug|d73a4a|Something broken"
  "type:docs|0075ca|Documentation fix or addition"
  "type:feature|a2eeef|New option, algorithm, or API"
  "type:improvement|c5def5|Enhance existing behaviour"
)
for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  gh label create "$name" --color "$color" --description "$desc" --force
done

echo "== npm bootstrap flow (first publish) =="
if npm view "$NAME" version >/dev/null 2>&1; then
  echo "skipped — $NAME already on the registry, use scripts/npm/publish-npm.sh"
else
  if ! npm whoami >/dev/null 2>&1; then
    echo "skipped — not logged in to npm, run 'npm login' then re-run this script"
  else
    VERSION=$(node -p "require('./package.json').version")
    echo "Publishing $NAME@$VERSION as the initial release..."
    bun run build
    bun run test

    npm publish --access public --ignore-scripts

    clear
    REMOTE=$(git remote get-url origin)
    ORG_REPO=$(echo "$REMOTE" | sed -E 's#(git@github\.com:|https://github\.com/)##; s#\.git$##')

    echo "https://www.npmjs.com/package/$NAME/access"
    echo ""
    echo "Publisher:              GitHub Actions"
    echo "Organization or user:    ${ORG_REPO%%/*}"
    echo "Repository:              ${ORG_REPO##*/}"
    echo "Workflow filename:       publish.yml"
    echo "Environment name:        (blank, unless the workflow sets 'environment:')"
    echo "Allowed actions:         Publish"
  fi
fi

echo ""
echo "✓ bootstrap done"
