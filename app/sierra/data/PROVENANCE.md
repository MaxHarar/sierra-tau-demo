# Sierra demo data — provenance

| Field | Value |
|-------|-------|
| Source repo | https://github.com/sierra-research/tau-bench |
| Pinned commit | `59a200c6d575d595120f1cb70fea53cef0632f6b` |
| License | MIT (see source repo `LICENSE` file) |
| Last fetched (UTC) | 2026-05-28T00:00:21Z |
| Fetched by | `scripts/sierra-import-tau.sh` |

## Files

| Local file | Upstream path |
|------------|---------------|
| `users.json` | `tau_bench/envs/airline/data/users.json` |
| `flights.json` | `tau_bench/envs/airline/data/flights.json` |
| `reservations.json` | `tau_bench/envs/airline/data/reservations.json` |
| `wiki.md` | `tau_bench/envs/airline/wiki.md` |

## Re-running

The import script is idempotent:

- Existing non-empty files are skipped.
- To force a refresh, delete the file (or all of `app/sierra/data/*.json`
  and `wiki.md`) and re-run the script.
- To bump to a newer upstream snapshot, edit `TAU_COMMIT` at the top of
  `scripts/sierra-import-tau.sh` and re-fetch.

## License note

The fetched data is MIT-licensed by sierra-research. We redistribute it
verbatim inside this repo for the `/sierra` demo at maxharar.com. The
upstream `LICENSE` file is the canonical legal text — see
https://github.com/sierra-research/tau-bench/blob/59a200c6d575d595120f1cb70fea53cef0632f6b/LICENSE.
