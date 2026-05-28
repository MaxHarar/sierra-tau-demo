# Sierra demo data — provenance

| Field | Value |
|-------|-------|
| Source repo | https://github.com/sierra-research/tau2-bench (τ³-bench v1.0.0) |
| Pinned commit | `c42db6cc223ef37c02ef2fb2f605ae0a4ca9afd6` |
| License | MIT (see source repo `LICENSE` file) |
| Last fetched (UTC) | 2026-05-28T02:55:00Z |
| Fetched by | `scripts/sierra-import-tau.sh` |

## Files

| Local file | Upstream path | Notes |
|------------|---------------|-------|
| `users.json` | `data/tau2/domains/airline/db.json` → `users` | split from the consolidated db.json |
| `flights.json` | `data/tau2/domains/airline/db.json` → `flights` | split from the consolidated db.json |
| `reservations.json` | `data/tau2/domains/airline/db.json` → `reservations` | split from the consolidated db.json |
| `policy.md` | `data/tau2/domains/airline/policy.md` | renamed from upstream `wiki.md` (legacy name in τ-bench v1) |

## Why τ³-bench

Sierra moved active eval work from `sierra-research/tau-bench` (now deprecated) to
`sierra-research/tau2-bench`. The new release is branded τ³-bench v1.0.0 and includes:

- **75+ task fixes** — incorrect expected actions removed, ambiguous instructions
  clarified, impossible constraints fixed (per [SABER, Cuadron et al. 2025](https://arxiv.org/abs/2512.07850))
- **`banking_knowledge` domain** added (RAG-based)
- **Voice full-duplex** evaluation support
- **Updated leaderboard** at [taubench.com](https://taubench.com)

The airline data shape is structurally identical to τ-bench v1 — same 500 users,
300 flights, 2000 reservations, same field names. The policy doc (`policy.md`,
previously `wiki.md`) is ~25% larger due to the task-fix clarifications.

## Re-running

The import script is idempotent:

- Existing non-empty files are skipped.
- To force a refresh, delete the file(s) under `app/sierra/data/` (excluding
  this PROVENANCE.md) and re-run the script.
- To bump to a newer upstream snapshot, edit `TAU_COMMIT` at the top of
  `scripts/sierra-import-tau.sh` and re-fetch.

## License note

The fetched data is MIT-licensed by sierra-research. We redistribute it
verbatim inside this repo for the `/sierra` demo at maxharar.com. The
upstream `LICENSE` file is the canonical legal text — see
https://github.com/sierra-research/tau2-bench/blob/c42db6cc223ef37c02ef2fb2f605ae0a4ca9afd6/LICENSE.
