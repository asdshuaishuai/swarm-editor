#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="run"
USE_CONFIGURATION_CACHE=true
EXTRA_ARGS=()

usage() {
    cat <<'EOF'
Swarm Editor Linux development launcher

Usage: ./scripts/dev-linux.sh [run|compile|test|build|pi] [options] [-- Gradle args]

Modes:
  run      Prepare pi and run the desktop application (default)
  compile  Incrementally compile desktop Kotlin sources without rebuilding pi
  test     Run all Kotlin tests
  build    Run the complete project build
  pi       Build only the vendored pi runtime

Options:
  --no-configuration-cache  Disable Gradle configuration cache
  -h, --help                Show this help

Examples:
  ./scripts/dev-linux.sh
  ./scripts/dev-linux.sh compile
  ./scripts/dev-linux.sh test -- --stacktrace
EOF
}

while (($# > 0)); do
    case "$1" in
        run|compile|test|build|pi)
            MODE="$1"
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

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This launcher supports Linux only." >&2
    exit 1
fi

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        printf 'Missing required command: %s\n' "$1" >&2
        exit 1
    fi
}

require_command java
if [[ ! -x ./gradlew ]]; then
    echo "Missing executable Gradle wrapper: ./gradlew" >&2
    exit 1
fi

JAVA_VERSION="$(java -version 2>&1 | head -n 1)"
if [[ "$JAVA_VERSION" =~ version\ \"([0-9]+) ]]; then
    JAVA_MAJOR="${BASH_REMATCH[1]}"
else
    echo "Unable to determine the active Java version." >&2
    exit 1
fi
if ((JAVA_MAJOR < 21)); then
    printf 'JDK 21 or newer is required; active Java is %s.\n' "$JAVA_MAJOR" >&2
    exit 1
fi

if [[ "$MODE" != "compile" ]]; then
    require_command node
    require_command npm
    NODE_VERSION="$(node --version | sed 's/^v//')"
    if ! printf '%s\n%s\n' "22.19.0" "$NODE_VERSION" | sort -V -C; then
        printf 'Node.js 22.19.0 or newer is required; active Node.js is %s.\n' "$NODE_VERSION" >&2
        exit 1
    fi
fi

TASKS=()
case "$MODE" in
    run)
        TASKS+=(":backend:preparePiRuntime" ":desktopApp:run")
        ;;
    compile)
        TASKS+=(":desktopApp:compileKotlin")
        ;;
    test)
        TASKS+=("test")
        ;;
    build)
        TASKS+=("build")
        ;;
    pi)
        TASKS+=(":backend:preparePiRuntime")
        ;;
esac

GRADLE_ARGS=(--parallel --build-cache)
if [[ "$USE_CONFIGURATION_CACHE" == true ]]; then
    GRADLE_ARGS+=(--configuration-cache)
fi

printf 'Swarm Editor Linux dev · %s\n' "$MODE"
printf 'Tasks: %s\n' "${TASKS[*]}"
STARTED_AT=$SECONDS

./gradlew "${TASKS[@]}" "${GRADLE_ARGS[@]}" "${EXTRA_ARGS[@]}"

printf 'Completed in %ss.\n' "$((SECONDS - STARTED_AT))"
