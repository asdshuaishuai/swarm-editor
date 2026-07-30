#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${GRADLE_USER_HOME}/wrapper" "${npm_config_cache}"
cp -a /opt/swarm-cache/wrapper/dists "${GRADLE_USER_HOME}/wrapper/"
cp -a /opt/swarm-cache/npm/_cacache "${npm_config_cache}/"

exec "$@"
