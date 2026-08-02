#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="compile"
WITH_PI=false
WATCH=false
USE_CONFIGURATION_CACHE=true
EXTRA_ARGS=()

usage() {
    cat <<'EOF'
Swarm Editor fast build

Usage: ./scripts/fast-build.sh [compile|run|verify|pi] [options] [-- Gradle args]

Modes:
  compile   Incrementally compile the desktop application (default, skips Pi)
  run       Prepare Pi when needed, then run the desktop application
  verify    Run all tests and the complete build
  pi        Build only the vendored Pi runtime

Options:
  --with-pi                 Build Pi before compile
  --watch                   Continuously recompile changed Kotlin sources
  --no-configuration-cache  Disable Gradle configuration cache
  -h, --help                Show this help

Examples:
  ./scripts/fast-build.sh
  ./scripts/fast-build.sh compile --watch
  ./scripts/fast-build.sh run
  ./scripts/fast-build.sh verify -- --stacktrace
EOF
}

while (($# > 0)); do
    case "$1" in
        compile|run|verify|pi)
            MODE="$1"
            ;;
        --with-pi)
            WITH_PI=true
            ;;
        --watch)
            WATCH=true
            ;;
        --no-configuration-cache)
            USE_CONFIGURATION_CACHE=false
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            EXTRA_ARGS+=("$@")
            break
            ;;
        *)
            printf 'Unknown option: %s\n\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

if [[ ! -x ./gradlew ]]; then
    echo "Missing executable Gradle wrapper: ./gradlew" >&2
    exit 1
fi

if [[ "$WATCH" == true && "$MODE" != "compile" ]]; then
    echo "--watch is only supported by compile mode" >&2
    exit 2
fi

GRADLE_ARGS=(--parallel --build-cache)
if [[ "$USE_CONFIGURATION_CACHE" == true ]]; then
    GRADLE_ARGS+=(--configuration-cache)
fi
if [[ -n "${CI:-}" ]]; then
    GRADLE_ARGS+=(--console=plain)
fi
if [[ "$WATCH" == true ]]; then
    GRADLE_ARGS+=(--continuous)
fi

TASKS=()
case "$MODE" in
    compile)
        if [[ "$WITH_PI" == true ]]; then
            TASKS+=(":backend:preparePiRuntime")
        fi
        TASKS+=(":desktopApp:compileKotlin")
        ;;
    run)
        TASKS+=(":backend:preparePiRuntime" ":desktopApp:run")
        ;;
    verify)
        TASKS+=("test" "build")
        ;;
    pi)
        TASKS+=(":backend:preparePiRuntime")
        ;;
esac

printf 'Swarm Editor · %s\n' "$MODE"
printf 'Tasks: %s\n' "${TASKS[*]}"
STARTED_AT=$SECONDS

./gradlew "${TASKS[@]}" "${GRADLE_ARGS[@]}" "${EXTRA_ARGS[@]}"

printf 'Completed in %ss.\n' "$((SECONDS - STARTED_AT))"
