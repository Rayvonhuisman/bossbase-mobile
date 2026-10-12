#!/bin/sh
# Lokale Git-hook tegen verkeerde pushes (zie docs/RELEASE.md).
# Installeren: cp scripts/pre-push.sh "$(git rev-parse --git-common-dir)/hooks/pre-push" && chmod +x "$_"
#
# Weigert:
# - elke push naar main: main verandert alleen via een gemergde pull request;
# - elke push die geen fast-forward is (force-push of een afwijkende geschiedenis).

NUL=0000000000000000000000000000000000000000

while read -r lokaal_ref lokaal_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "pre-push: rechtstreeks pushen naar main is uitgeschakeld; gebruik een pull request." >&2
    exit 1
  fi
  # Verwijderen van een remote branch of een nieuwe branch: geen fast-forward-vraag.
  [ "$lokaal_sha" = "$NUL" ] && continue
  [ "$remote_sha" = "$NUL" ] && continue
  if ! git merge-base --is-ancestor "$remote_sha" "$lokaal_sha" 2>/dev/null; then
    echo "pre-push: $remote_ref zou geen fast-forward zijn (force-push); geweigerd." >&2
    exit 1
  fi
done
exit 0
