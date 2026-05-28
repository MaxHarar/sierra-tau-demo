#!/usr/bin/env bash
# scripts/sierra-import-tau.sh
#
# Idempotently fetch the τ³-bench airline domain data + policy from
# sierra-research/tau2-bench (MIT) into app/sierra/data/.
#
# tau2-bench (τ³-bench v1.0.0) ships the airline data as a single
# consolidated db.json with three top-level keys (users, flights,
# reservations). This script fetches db.json + policy.md and splits
# db.json into three files matching our existing layout.
#
# Pinned to a specific commit SHA so the imported corpus never drifts
# under us. Re-running is safe: existing non-empty files are skipped.
#
# Usage: ./scripts/sierra-import-tau.sh   (from repo root)
#
# Requires: curl, jq

set -euo pipefail

# --- Pinned source -----------------------------------------------------------
TAU_REPO="sierra-research/tau2-bench"
TAU_COMMIT="c42db6cc223ef37c02ef2fb2f605ae0a4ca9afd6"
TAU_LICENSE="MIT"
RAW_BASE="https://raw.githubusercontent.com/${TAU_REPO}/${TAU_COMMIT}"

# --- Destination -------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="${REPO_ROOT}/app/sierra/data"

mkdir -p "${DEST_DIR}"

# --- Prereq check ------------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required (brew install jq)" >&2
  exit 1
fi

# --- Fetch db.json (split) ---------------------------------------------------
fetch_db_split() {
  # Skip if all three split files are already present and non-empty
  if [[ -s "${DEST_DIR}/users.json" && -s "${DEST_DIR}/flights.json" && -s "${DEST_DIR}/reservations.json" ]]; then
    echo "skip: users.json + flights.json + reservations.json already present" >&2
    return 0
  fi

  local url="${RAW_BASE}/data/tau2/domains/airline/db.json"
  local tmp="${DEST_DIR}/.db.json.tmp.$$"
  echo "fetch: ${url}" >&2
  if ! curl --fail --silent --show-error -L --connect-timeout 10 --max-time 120 \
        -o "${tmp}" "${url}"; then
    rm -f "${tmp}"
    echo "error: failed to download db.json" >&2
    return 1
  fi
  if [[ ! -s "${tmp}" ]]; then
    rm -f "${tmp}"
    echo "error: downloaded db.json is empty" >&2
    return 1
  fi

  for key in users flights reservations; do
    local out="${DEST_DIR}/${key}.json"
    jq ".${key}" "${tmp}" > "${out}"
    echo "ok:    ${key}.json ($(wc -c < "${out}") bytes; $(jq 'length' "${out}") entries)" >&2
  done
  rm -f "${tmp}"
}

# --- Fetch policy.md ---------------------------------------------------------
fetch_policy() {
  local dest="${DEST_DIR}/policy.md"
  if [[ -s "${dest}" ]]; then
    echo "skip: policy.md already present ($(wc -c < "${dest}") bytes)" >&2
    return 0
  fi
  local url="${RAW_BASE}/data/tau2/domains/airline/policy.md"
  local tmp="${dest}.tmp.$$"
  echo "fetch: ${url}" >&2
  if curl --fail --silent --show-error -L --connect-timeout 10 --max-time 60 \
        -o "${tmp}" "${url}"; then
    if [[ ! -s "${tmp}" ]]; then
      echo "error: downloaded policy.md is empty" >&2
      rm -f "${tmp}"
      return 1
    fi
    mv "${tmp}" "${dest}"
    echo "ok:    policy.md ($(wc -c < "${dest}") bytes)" >&2
  else
    rm -f "${tmp}"
    echo "error: failed to download policy.md" >&2
    return 1
  fi
}

fetch_db_split
fetch_policy

# --- Provenance --------------------------------------------------------------
FETCH_DATE_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "${DEST_DIR}/PROVENANCE.md" <<EOF
# Sierra demo data — provenance

| Field | Value |
|-------|-------|
| Source repo | https://github.com/${TAU_REPO} (τ³-bench v1.0.0) |
| Pinned commit | \`${TAU_COMMIT}\` |
| License | ${TAU_LICENSE} (see source repo \`LICENSE\` file) |
| Last fetched (UTC) | ${FETCH_DATE_UTC} |
| Fetched by | \`scripts/sierra-import-tau.sh\` |

## Files

| Local file | Upstream path | Notes |
|------------|---------------|-------|
| \`users.json\` | \`data/tau2/domains/airline/db.json\` → \`users\` | split from the consolidated db.json |
| \`flights.json\` | \`data/tau2/domains/airline/db.json\` → \`flights\` | split from the consolidated db.json |
| \`reservations.json\` | \`data/tau2/domains/airline/db.json\` → \`reservations\` | split from the consolidated db.json |
| \`policy.md\` | \`data/tau2/domains/airline/policy.md\` | renamed from upstream \`wiki.md\` (legacy name in τ-bench v1) |

## License note

The fetched data is MIT-licensed by sierra-research. The upstream \`LICENSE\`
file is the canonical legal text — see
https://github.com/${TAU_REPO}/blob/${TAU_COMMIT}/LICENSE.
EOF

echo "ok:    PROVENANCE.md updated" >&2
echo "done:  ${DEST_DIR}" >&2
