# Pass^1

> A working customer-service agent built against [Sierra's open τ-bench airline domain](https://github.com/sierra-research/tau-bench).
> **Live demo:** [maxharar.com/sierra](https://maxharar.com/sierra)
> **Stack:** Claude Sonnet 4.5 · Vercel AI SDK v6 · Upstash · Next.js 16

Shipped in two days. Honest pass^1, calibrated refusals, real τ-bench tool calls, no fake data.

---

## What this is

[Sierra](https://sierra.ai) (Bret Taylor's company) published **τ-bench** — an open agent-reliability benchmark with two domains: retail and **airline**. They named the reliability metric **pass^k**: the probability the agent passes *every* attempt across k i.i.d. trials. Customer-service agents get one shot per customer; "at least one of k" is not a meaningful business metric.

This repo ships a single-page interactive agent against τ-bench's airline domain. The agent uses Sierra's policy doc (`wiki.md`) as its system prompt, the seeded τ-bench corpus as in-memory state, and Anthropic Claude Sonnet 4.5 for reasoning. Eight Zod-typed tools mirror the τ-bench airline action surface. Every chip in the demo is a representative task from one of five categories Sierra cares about.

### What this is NOT

- A generic travel chatbot ("plan my Tokyo trip")
- A multi-API live booking system (Amadeus, Skyscanner, etc.) — τ-bench's seeded JSON IS the data
- A Cursor-template chatbot UI — three-pane workbench with visible trace, or don't ship

---

## Live demo

**[maxharar.com/sierra](https://maxharar.com/sierra)**

The five canonical chips on the page each exercise a behavior τ-bench scores:

| # | Chip | What it demonstrates |
|---|---|---|
| 1 | Change my flight to LAX | Tool use + state mutation + confirmation theatre |
| 2 | Cancel my reservation | Policy-driven happy-path mutation |
| 3 | Bump me to first class, free | **Calibrated refusal** — the agent stays on-policy under pressure |
| 4 | What's my flight status? | Light query, latency budget |
| 5 | Refund me but keep the seat | Handles contradictory user requests gracefully |

---

## Pass^1 (n=3, claude-sonnet-4-5)

| Task | pass^1 |
|---|---|
| Change my flight to LAX | 0.000 |
| Cancel my reservation | 0.667 |
| Bump me to first class, free (refusal) | **1.000** |
| What's my flight status? (lookup) | **1.000** |
| Refund me but keep the seat (contradiction) | **1.000** |
| **Aggregate** | **0.733** |

### Methodology disclosure

The score above is our own measurement on these 5 tasks, **not a re-run of Sierra's full 50-task suite.** Sierra's published τ-bench leaderboard does not include a Sonnet 4.5 number; the widely-cited figure (pass^1 ≈ 0.700) is from third-party aggregators.

The cancel-flight chip scores below 1.0 because the τ-airline policy mandates explicit user confirmation before any mutating tool call. Our eval uses a regex-based auto-confirmer that recognises common phrasings and responds "yes, proceed." The change-flight chip stays at 0/3 because Mia Li's prompt is genuinely ambiguous about which of her three reservations to modify — a heuristic auto-confirmer can't pick a candidate the way a real user would. The three non-mutating chips (refusal, lookup, contradiction) score 1.000 each — the agent stays on-policy in every trial.

A full τ-bench-style simulated-user LLM that holds task intent across turns would lift the change-flight chip without changing the agent — that's the v1.1 work.

Eval script: [`scripts/sierra-eval.ts`](./scripts/sierra-eval.ts). Output: [`app/sierra/data/pass1.json`](./app/sierra/data/pass1.json).

---

## Architecture

```
Browser  ──POST /api/sierra/chat──▶  Next.js API route
                                      │
                                      ├─ headers() → x-forwarded-for → IP
                                      ├─ Upstash: ratelimit.limit(ip)         → 429 on bust
                                      ├─ Upstash: dailyBudget.exceeded()      → 503 on cap
                                      ├─ Zod-validate body (max 128 char sessionId)
                                      │
                                      └──streamText({model, system, messages, tools})──▶  Anthropic
                                                            ◀──SSE stream (text-delta, tool-input-*, tool-output-*)
                                      │
                                      ├─ tool.execute() runs locally (reads/mutates in-memory AirlineWorld)
                                      │
                                      └──toUIMessageStreamResponse()──▶  Browser useChat()
                                                                         ◀── renders parts as they arrive

  onFinish: dailyBudget.charge(usage)  → Upstash INCRBYFLOAT (logged via structured JSON)
```

### Key design decisions

1. **Stateless-by-rehydration world.** Vercel serverless functions don't share process memory. The canonical world state is the message history `useChat()` ships on every POST. Mutating tool calls are replayed against a fresh corpus clone to reconstruct the current world deterministically. The in-process Map cache is a *perf* mechanism, not a correctness one.
2. **Tools never throw.** Every `execute()` returns `{ error: '...' }` on invalid input so the model can self-correct.
3. **Calibrated action over verbosity.** The agent's system prompt is Sierra's own `wiki.md`. Refusal-on-policy is rewarded, not refusal-by-default.
4. **Honest numbers beat polished claims.** The page displays the real pass^1 from the eval, including the chips that score 0.
5. **No new framework.** Vanilla Tailwind v4 + small components. No shadcn, no Framer Motion, no UI library.

---

## Quick start

### Prerequisites

- Node 20+ and [pnpm](https://pnpm.io/installation) 10+
- An [Anthropic API key](https://console.anthropic.com/)
- An [Upstash Redis](https://upstash.com/) database (free tier is plenty)

### Run it

```bash
git clone https://github.com/MaxHarar/sierra-tau-demo.git
cd sierra-tau-demo
pnpm install

cp .env.example .env.local
# fill in ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

pnpm dev
# open http://localhost:3000
```

### Scripts

```bash
pnpm dev      # Next.js dev server with Turbopack
pnpm build    # production build
pnpm start    # serve the production build
pnpm lint     # ESLint
pnpm smoke    # verify the τ-bench data + types + world rebuild load
pnpm eval     # run the pass^1 eval against the live Anthropic API (real spend)
```

### Re-running the eval

```bash
set -a; source .env.local; set +a
pnpm tsx scripts/sierra-eval.ts --n 10 --out app/sierra/data/pass1.json --verbose
```

`--n` controls attempts per task. n=3 costs ~$0.42 in Sonnet 4.5 credits and runs in ~3-5 minutes (rate-limited to one turn every ~30s to stay under tier-1 token limits). Bump to n=10 for a more confident number — ~$1.50, ~12 minutes.

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Server-only Anthropic key. **Must NOT be in the `NEXT_PUBLIC_` namespace.** |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash REST endpoint URL |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash REST token |
| `SIERRA_MODEL_ID` | no | Default `claude-sonnet-4-5`. Swap to `claude-haiku-4-5` for ~5× cheaper. |
| `SIERRA_RATE_LIMIT_PER_MIN` | no | Default `10`. Per-IP sliding-window cap. |
| `SIERRA_DAILY_CAP_USD` | no | Default `5.00`. Global Anthropic spend ceiling. |
| `SIERRA_STOP_AFTER_STEPS` | no | Default `20`. Agent-loop step ceiling per turn. |

---

## Repo layout

```
.
├── app/
│   ├── api/sierra/chat/route.ts    # POST handler — streamText, ratelimit, budget, Zod-validated
│   ├── sierra/
│   │   ├── data/
│   │   │   ├── users.json          # τ-bench airline corpus (MIT) — 500 users
│   │   │   ├── flights.json        # 300 flights
│   │   │   ├── reservations.json   # 2000 reservations
│   │   │   ├── wiki.md             # τ-airline policy doc — becomes the system prompt
│   │   │   ├── canonical-tasks.ts  # 5 task expectations with judge() functions
│   │   │   ├── pass1.json          # eval output (committed; regen with pnpm eval)
│   │   │   └── PROVENANCE.md       # τ-bench attribution + fetch date
│   │   └── page.tsx                # /sierra — server component
│   ├── globals.css                 # design tokens + .sierra-workbench-fullbleed
│   ├── layout.tsx                  # root shell
│   └── page.tsx                    # redirects to /sierra
├── components/sierra/
│   ├── Workbench.tsx               # three-pane layout, owns useChat()
│   ├── ChatPane.tsx                # message list + composer, walks parts
│   ├── FlowPane.tsx                # itinerary state view (most-recent reservation lookup)
│   ├── TracePane.tsx               # tool-call timeline
│   ├── ToolCallCard.tsx            # one tool invocation, 4 visual states
│   ├── ChipRow.tsx                 # 5 example chips
│   ├── PolicyChip.tsx              # rule-citation chip → side sheet (v1.1: real wiki.md resolution)
│   ├── DiffCard.tsx                # itinerary diff (v1.1: wire into ChatPane on update_reservation_flights)
│   └── BudgetBanner.tsx            # daily $ cap reached state
├── lib/sierra/
│   ├── types.ts                    # User, Flight, Reservation, AirlineWorld, Cabin, …
│   ├── world.ts                    # stateless-by-rehydration: buildWorld(messages) + getWorld()
│   ├── tools.ts                    # 8 v1 Zod-typed tools (factory closes over world)
│   ├── wiki.ts                     # lazy getAirlineWiki() — server-only fs read
│   ├── ratelimit.ts                # @upstash/ratelimit sliding window
│   ├── budget.ts                   # day-keyed Redis counter, 36h TTL, Sonnet pricing
│   ├── log.ts                      # structured JSON, SHA-256 IP hashing, never message content
│   └── config.ts                   # env-tunable runtime knobs
├── content/sierra/
│   └── chips.ts                    # 5 pre-baked chip prompts
└── scripts/
    ├── sierra-eval.ts              # pass^1 eval CLI with multi-turn auto-confirm
    ├── smoke-sierra-scaffold.ts    # verify corpus + types + world load
    └── sierra-import-tau.sh        # one-shot import from sierra-research/tau-bench
```

---

## The 8 v1 tools

Selected from τ-bench's 14 airline tools. Full Zod schemas in [`lib/sierra/tools.ts`](./lib/sierra/tools.ts).

| Tool | Mutates? | Purpose |
|---|---|---|
| `get_user_details` | no | Look up a user by `user_id` |
| `get_reservation_details` | no | Look up a reservation by `reservation_id` |
| `search_direct_flight` | no | Direct flights between two cities on a date |
| `search_onestop_flight` | no | One-stop flights (returns up to 20 `[leg1, leg2]` pairs) |
| `update_reservation_flights` | yes | Replace flights on a reservation; validates each flight exists + is available |
| `cancel_reservation` | yes | Cancel a reservation; returns refund metadata |
| `update_reservation_baggages` | yes | Set total + nonfree baggages |
| `calculate` | no | Safe arithmetic only (no `eval`, no `Function`; max 256 chars; correct precedence) |

τ-bench's other 6 tools (`book_reservation`, `list_all_airports`, `send_certificate`, `think`, `transfer_to_human_agents`, `update_reservation_passengers`) are deferred to v1.1 — they're not required by the 5 demo chips and keeping the tool list small reduces context tax on the system prompt.

---

## What's measured vs not (v1.1 backlog)

This demo is intentionally scoped for two days. Items here are real but deferred:

- **Full τ-bench-style multi-turn simulated-user eval.** Current eval uses a regex auto-confirmer; a proper simulated user (the Sierra harness pattern) would lift the change-flight chip without changing the agent.
- **Real wiki.md resolution in `<PolicyChip />`.** Currently the side sheet shows a placeholder. Resolving `rule 3.2.1` to the actual paragraph in `wiki.md` is a small parser.
- **Wire `<DiffCard />` into `<ChatPane />`** on `update_reservation_flights` flows so the before/after itinerary diff renders inline.
- **Discriminated union for `WorldAction`** via Zod inference — eliminates the four `as unknown as` casts in the codebase.
- **Replace `PartLike` cast in ChatPane** with AI SDK's `isToolUIPart` / `isTextUIPart` / `getToolName` exports.
- **Tag `PaymentMethod` as a discriminated union** instead of an open record with optional siblings.
- **Voice toggle** via ElevenLabs Conversational AI widget — verifies the "single agent across chat + voice" framing.
- **LRU eviction** on the warm-Lambda session cache (currently unbounded `Map`).
- **`ANTHROPIC_PROMPT_CACHE`** on the system prompt — would cut per-turn input cost ~10×.

---

## Credits & license

- **τ-bench data + policy** from [sierra-research/tau-bench](https://github.com/sierra-research/tau-bench), MIT-licensed. See [`app/sierra/data/PROVENANCE.md`](./app/sierra/data/PROVENANCE.md) for the pinned commit SHA + fetch date.
- **τ-bench paper:** Yao et al., *τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains*, [arXiv:2406.12045](https://arxiv.org/abs/2406.12045).
- **pass^k formula:** see [Philipp Schmid's breakdown](https://www.philschmid.de/agents-pass-at-k-pass-power-k).
- Companion site: [maxharar.com/sierra](https://maxharar.com/sierra) (deployed on Vercel).

**License:** MIT. See [LICENSE](./LICENSE).

---

## Why this exists

The default move when applying for a job is a LinkedIn DM. The asymmetric move is to ship the thing they'd hire you to build, anchor it on their own published benchmark, and let the artifact open the door.

If you're working on agent reliability and this resonates, [say hi](mailto:max.harar@gmail.com).
