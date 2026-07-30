#!/usr/bin/env bash
set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "${repository_root}"

runtime="${SWARM_EVAL_RUNTIME:-podman}"
base_image="${SWARM_EVAL_BASE_IMAGE:-docker.io/library/eclipse-temurin:21.0.8_9-jdk-jammy}"
manifest_path="${SWARM_EVAL_MANIFEST:-infra/evaluation/image-manifest.local.json}"
source_revision="$(git rev-parse HEAD)"
source_dirty=false
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    source_dirty=true
fi

command -v "${runtime}" >/dev/null
command -v skopeo >/dev/null
[[ "$("${runtime}" info --format '{{.Host.Security.Rootless}}')" == "true" ]] || {
    echo "A functioning rootless Podman runtime is required." >&2
    exit 1
}

if [[ "${base_image}" == *@sha256:* ]]; then
    pinned_base_image="${base_image}"
else
    base_digest="$(skopeo inspect --format '{{.Digest}}' "docker://${base_image}")"
    pinned_base_image="${base_image}@${base_digest}"
fi
"${runtime}" pull "${pinned_base_image}"

source_tree_hash="$({
    git ls-files -co --exclude-standard -z \
        | sort -z \
        | xargs -0 sha256sum
} | sha256sum | cut -d' ' -f1)"
image_tag="${SWARM_EVAL_TAG:-localhost/swarm-eval:${source_revision:0:12}-${source_tree_hash:0:12}}"

"${runtime}" build \
    --file infra/evaluation/Containerfile \
    --ignorefile infra/evaluation/container.ignore \
    --pull=never \
    --tag "${image_tag}" \
    --build-arg "BASE_IMAGE=${pinned_base_image}" \
    --build-arg "SOURCE_REVISION=${source_revision}" \
    --build-arg "SOURCE_TREE_HASH=${source_tree_hash}" \
    .

image_id="$("${runtime}" image inspect --format '{{.Id}}' "${image_tag}")"
mkdir -p "$(dirname "${manifest_path}")"
cat >"${manifest_path}" <<EOF
{
  "schemaVersion": 1,
  "sourceRevision": "${source_revision}",
  "sourceTreeSha256": "${source_tree_hash}",
  "sourceDirty": ${source_dirty},
  "baseImage": "${pinned_base_image}",
  "imageTag": "${image_tag}",
  "imageId": "${image_id}",
  "nodeVersion": "22.19.0",
  "jdkMajor": 21
}
EOF

echo "Wrote ${manifest_path}"
echo "export SWARM_EVAL_IMAGE=${image_id}"
