#!/bin/sh
set -eu
# Run from a clean checkout containing this runner; model-generated changes never enter this build.
revision=${1:?Usage: build-image.sh FULL_COMMIT_SHA}
case "$revision" in *[!0-9a-f]*|'') exit 1;; esac
[ "${#revision}" = 40 ]
git cat-file -e "$revision^{commit}"
context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT INT TERM
git archive "$revision" | tar -x -C "$context"
cp -R cocoa-runner "$context/cocoa-runner"
cp .dockerignore "$context/.dockerignore"
docker build -f "$context/cocoa-runner/Dockerfile" --build-arg "DEMO_REVISION=$revision" -t cocoa-demo-runner:verified "$context"
docker image inspect cocoa-demo-runner:verified --format '{{.Id}}'
