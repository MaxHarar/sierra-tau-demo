#!/usr/bin/env bash
# scripts/sierra-import-tau.sh
#
# Idempotently fetch the τ-airline benchmark data + policy wiki from
# sierra-research/tau-bench (MIT) into app/sierra/data/.
#
# Pinned to a specific commit SHA so the imported corpus never drifts
# under us. Re-running is safe: existing non-empty files are skipped.
#
# Usage: ./scripts/sierra-import-tau.sh   (from repo root)

set -euo pipefail

# --- Pinned source -----------------------------------------------------------
TAU_REPO="sierra-research/tau-bench"
TAU_COMMIT="59a200c6d575d595120f1cb70fea53cef0632f6b"
TAU_LICENSE="MIT"
RAW_BASE="https://raw.githubusercontent.com/${TAU_REPO}/${TAU_COMMIT}"

# --- Destination -------------------------------------------------------------
# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${REPO_ROOT}/app/sierra/data"

mkdir -p "${DEST_DIR}"

# --- Files to fetch ----------------------------------------------------------
# Format: "<source-path-in-tau-bench>::<dest-filename-in-DEST_DIR>"
FILES=(
  "tau_bench/envs/airline/data/users.json::users.json"
  "tau_bench/envs/airline/data/flights.json::flights.json"
  "tau_bench/envs/airline/data/reservations.json::reservations.json"
  "tau_bench/envs/airline/wiki.md::wiki.md"
)

fetch_one() {
  local src_path="$1"
  local dest_name="$2"
  local dest_path="${DEST_DIR}/${dest_name}"
  local url="${RAW_BASE}/${src_path}"

  if [[ -s "${dest_path}" ]]; then
    echo "skip: ${dest_name} already present ($(wc -c < "${dest_path}") bytes)" >&2
    return 0
  fi

  echo "fetch: ${url}" >&2
  # Download to a temp file first; only move into place on success so a
  # partial download never leaves a corrupt file behind.
  local tmp="${dest_path}.tmp.$$"
  if curl --fail --silent --show-error -L --connect-timeout 10 --max-time 60 \
        -o "${tmp}" "${url}"; then
    if [[ ! -s "${tmp}" ]]; then
      echo "error: downloaded ${dest_name} is empty" >&2
      rm -f "${tmp}"
      return 1
    fi
    mv "${tmp}" "${dest_path}"
    echo "ok:    ${dest_name} ($(wc -c < "${dest_path}") bytes)" >&2
  else
    rm -f "${tmp}"
    echo "error: failed to download ${url}" >&2
    return 1
  fi
}

for entry in "${FILES[@]}"; do
  src="${entry%%::*}"
  dest="${entry##*::}"
  fetch_one "${src}" "${dest}"
done

# --- Provenance --------------------------------------------------------------
# Always (re)write PROVENANCE.md so the pinned SHA / fetch date stay accurate
# on the most recent run. Idempotent because content is fully derived.
FETCH_DATE_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "${DEST_DIR}/PROVENANCE.md" <<EOF
# Sierra demo data — provenance

| Field | Value |
|-------|-------|
| Source repo | https://github.com/${TAU_REPO} |
| Pinned commit | \`${TAU_COMMIT}\` |
| License | ${TAU_LICENSE} (see source repo \`LICENSE\` file) |
| Last fetched (UTC) | ${FETCH_DATE_UTC} |
| Fetched by | \`scripts/sierra-import-tau.sh\` |

## Files

| Local file | Upstream path |
|------------|---------------|
| \`users.json\` | \`tau_bench/envs/airline/data/users.json\` |
| \`flights.json\` | \`tau_bench/envs/airline/data/flights.json\` |
| \`reservations.json\` | \`tau_bench/envs/airline/data/reservations.json\` |
| \`wiki.md\` | \`tau_bench/envs/airline/wiki.md\` |

## Re-running

The import script is idempotent:

- Existing non-empty files are skipped.
- To force a refresh, delete the file (or all of \`app/sierra/data/*.json\`
  and \`wiki.md\`) and re-run the script.
- To bump to a newer upstream snapshot, edit \`TAU_COMMIT\` at the top of
  \`scripts/sierra-import-tau.sh\` and re-fetch.

## License note

The fetched data is MIT-licensed by sierra-research. We redistribute it
verbatim inside this repo for the \`/sierra\` demo at maxharar.com. The
upstream \`LICENSE\` file is the canonical legal text — see
https://github.com/${TAU_REPO}/blob/${TAU_COMMIT}/LICENSE.
EOF

echo "ok:    PROVENANCE.md updated" >&2
echo "done:  ${DEST_DIR}" >&2
