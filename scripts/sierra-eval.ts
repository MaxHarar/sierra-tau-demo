/**
 * Sierra pass^1 eval CLI (TDD § 12).
 *
 * Runs each canonical task `--n` times against a real Anthropic-backed
 * tool-using agent loop, judges each trial with the task's `judge(world)`
 * function, aggregates pass^1 per task, and writes the result to
 * `app/sierra/data/pass1.json` (which the /sierra page renders).
 *
 * Bypasses `app/api/sierra/chat/route.ts` deliberately — we call `streamText`
 * directly so the rate-limit and daily-budget guards don't interfere with a
 * batch eval. Each trial gets a fresh world (no carry-over between trials).
 *
 * USAGE
 *   pnpm tsx scripts/sierra-eval.ts \
 *     [--n 3] [--model claude-sonnet-4-5] \
 *     [--out app/sierra/data/pass1.json] [--verbose]
 *
 * REQUIREMENTS
 *   ANTHROPIC_API_KEY must be set (auto-loaded from .env.local at top).
 */

// ----- Inline .env.local loader (no dotenv dep). Must run before any
//       module that touches process.env at import time.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && m[1] && m[2] !== undefined && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }
}

import { streamText, stepCountIs, convertToModelMessages, type ModelMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildWorld } from '../lib/sierra/world';
import { airlineTools } from '../lib/sierra/tools';
import { getAirlineWiki } from '../lib/sierra/wiki';
import { CONFIG } from '../lib/sierra/config';
import { CANONICAL_TASKS } from '../app/sierra/data/canonical-tasks';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const N = Number(getFlag('--n') ?? 3);
const MODEL_ID = getFlag('--model') ?? CONFIG.modelId;
const OUT = getFlag('--out') ?? 'app/sierra/data/pass1.json';
const VERBOSE = args.includes('--verbose');
// Throttle between turns/trials to stay under per-minute input-token limits
// (tier-1 Anthropic is 30K input tok/min on Sonnet 4.5). Each turn carries the
// full ~6KB wiki system prompt, so 3 turns of a trial ~= 13.5K input tokens;
// adding a delay between API calls keeps the eval under the cap.
const TURN_DELAY_MS = Number(getFlag('--turn-delay-ms') ?? 30000);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FAIL: ANTHROPIC_API_KEY not set. Source .env.local or export it.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Trial runner
// ---------------------------------------------------------------------------

interface TrialResult {
  trial: number;
  pass: boolean;
  reason: string;
  actions: { name: string; kwargs: unknown }[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

// Multi-turn auto-confirm — matches τ-bench's harness methodology where a
// simulated user follows up with confirmations. Single-turn evals understate
// pass^1 because the τ-airline policy requires explicit user confirmation
// before any mutating call (so the agent never mutates on turn 1 — by design).
const MAX_TURNS = 4;

// Broad heuristic: the agent is asking the user something. Matches τ-bench's
// simulated-user pattern of nudging the agent past confirmation gates and
// clarifying questions. We treat any question-marked or confirmation-flavored
// reply as a prompt the user must answer.
const CONFIRM_PATTERNS: RegExp[] = [
  /\b(should|shall|can|may|would you like (me|us) to)\b.*?\bproceed\b/i,
  /\bconfirm\b/i,
  /\b(do you want|would you like) (me|us) to (proceed|continue|go ahead|cancel|update|change|make|submit|book)/i,
  /\b(please )?confirm/i,
  /\byes\s*\/\s*no\b/i,
  /\bplease let me know\b/i,
  /\bare you sure\b/i,
  /\bis that correct\b/i,
  /\bcould you (please )?clarify\b/i,
  /\bwhich reservation\b/i,
  /\bwhat is your reason\b/i,
  /\?\s*$/, // ends in a question
];

function asksForConfirmation(text: string): boolean {
  return CONFIRM_PATTERNS.some((re) => re.test(text.trim()));
}

// Pick a follow-up message that matches what the agent is asking for. Mirrors
// τ-bench's simulated user, which provides minimal additional information
// rather than just "yes" when the agent's question is open-ended.
function chooseUserReply(text: string): string {
  if (/\bwhat is your reason\b|\breason for (cancellation|cancelling)\b/i.test(text)) {
    return 'Change of plan. Please proceed with the cancellation.';
  }
  if (/\bwhich reservation\b|\bcould you (please )?clarify\b/i.test(text)) {
    return 'Yes, that is correct — please proceed with that change.';
  }
  return 'Yes, please proceed.';
}

async function runTrial(taskId: string, prompt: string, trial: number): Promise<TrialResult> {
  const startedAt = Date.now();
  const world = buildWorld([]);
  const tools = airlineTools(world);
  const task = CANONICAL_TASKS.find((t) => t.id === taskId);
  if (!task) throw new Error(`unknown task: ${taskId}`);

  // History grows turn by turn (ModelMessage[] shape).
  const history: ModelMessage[] = await convertToModelMessages([
    {
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: prompt }],
    },
  ]);

  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let turnsUsed = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (turn > 0 && TURN_DELAY_MS > 0) {
      await new Promise((res) => setTimeout(res, TURN_DELAY_MS));
    }
    turnsUsed++;
    let inputTokens = 0;
    let outputTokens = 0;

    const result = streamText({
      model: anthropic(MODEL_ID),
      system: getAirlineWiki(),
      messages: history,
      tools,
      stopWhen: stepCountIs(CONFIG.stopAfterSteps),
      onFinish: ({ usage }) => {
        inputTokens = usage?.inputTokens ?? 0;
        outputTokens = usage?.outputTokens ?? 0;
      },
    });

    // Drain the stream so onFinish fires and all tool calls execute.
    for await (const _ of result.fullStream) {
      void _;
    }

    inputTokensTotal += inputTokens;
    outputTokensTotal += outputTokens;

    // Final assistant text for this turn (used to detect confirmation prompts).
    const lastAssistantText = await result.text;
    // All messages emitted by this turn (assistant + tool messages) — append
    // to history so the next turn sees the full conversation.
    const newMessages = (await result.response).messages;
    history.push(...newMessages);

    if (VERBOSE) {
      const preview = lastAssistantText.replace(/\s+/g, ' ').slice(0, 600);
      console.log(`    [turn ${turn + 1}] "${preview}${lastAssistantText.length > 600 ? '…' : ''}"`);
    }

    // Probe judge — if the agent satisfied the task, stop.
    const probe = task.judge(world);
    if (probe.pass) break;

    // If we still have turns left and the agent is asking for confirmation,
    // auto-confirm and loop.
    if (turn < MAX_TURNS - 1 && asksForConfirmation(lastAssistantText)) {
      const reply = chooseUserReply(lastAssistantText);
      const yesMessages: ModelMessage[] = await convertToModelMessages([
        {
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: reply }],
        },
      ]);
      history.push(...yesMessages);
      if (VERBOSE) console.log(`    [auto-confirm] "${reply}"`);
      continue;
    }

    // Agent isn't asking for confirmation and judge hasn't passed — done.
    break;
  }

  const { pass, reason } = task.judge(world);

  return {
    trial,
    pass,
    reason: turnsUsed > 1 ? `${reason} (turns: ${turnsUsed})` : reason,
    actions: world.actions.map((a) => ({ name: a.name, kwargs: a.kwargs })),
    inputTokens: inputTokensTotal,
    outputTokens: outputTokensTotal,
    durationMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Task aggregator
// ---------------------------------------------------------------------------

interface TaskResult {
  id: string;
  label: string;
  passes: number;
  trials: number;
  pass1: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  perTrial: TrialResult[];
}

// Anthropic claude-sonnet-4-5 list price (TDD § 12). $/token.
const SONNET_IN = 3 / 1_000_000;
const SONNET_OUT = 15 / 1_000_000;

async function runTask(taskId: string, n: number): Promise<TaskResult> {
  const task = CANONICAL_TASKS.find((t) => t.id === taskId);
  if (!task) throw new Error(`unknown task: ${taskId}`);
  console.log(`\n▶ ${task.label} (n=${n})`);
  const trials: TrialResult[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0 && TURN_DELAY_MS > 0) {
      await new Promise((res) => setTimeout(res, TURN_DELAY_MS));
    }
    process.stdout.write(`  trial ${i + 1}/${n}... `);
    try {
      const r = await runTrial(taskId, task.prompt, i + 1);
      trials.push(r);
      console.log(r.pass ? `✓  ${r.reason}` : `✗  ${r.reason}`);
      if (VERBOSE) {
        console.log(`    actions: ${r.actions.map((a) => a.name).join(', ') || '(none)'}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`✗  EXCEPTION: ${msg}`);
      trials.push({
        trial: i + 1,
        pass: false,
        reason: `exception: ${msg}`,
        actions: [],
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
      });
    }
  }
  const passes = trials.filter((t) => t.pass).length;
  const totalInputTokens = trials.reduce((a, t) => a + t.inputTokens, 0);
  const totalOutputTokens = trials.reduce((a, t) => a + t.outputTokens, 0);
  return {
    id: task.id,
    label: task.label,
    passes,
    trials: n,
    pass1: passes / n,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: totalInputTokens * SONNET_IN + totalOutputTokens * SONNET_OUT,
    perTrial: trials,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Sierra eval — model=${MODEL_ID} n=${N}`);
  const results: TaskResult[] = [];
  for (const task of CANONICAL_TASKS) {
    const r = await runTask(task.id, N);
    results.push(r);
  }
  const aggregate = results.reduce((a, r) => a + r.pass1, 0) / results.length;
  const totalCost = results.reduce((a, r) => a + r.totalCostUsd, 0);

  console.log(`\n━━━ AGGREGATE ━━━`);
  for (const r of results) {
    console.log(
      `  ${r.id.padEnd(28)} pass^1 = ${r.pass1.toFixed(3)} (${r.passes}/${r.trials})  $${r.totalCostUsd.toFixed(4)}`,
    );
  }
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  aggregate pass^1 = ${aggregate.toFixed(3)}  total cost $${totalCost.toFixed(4)}`);

  const out = {
    generatedAt: new Date().toISOString(),
    model: MODEL_ID,
    attemptsPerTask: N,
    aggregate,
    totalCostUsd: totalCost,
    tasks: results.map((r) => ({
      id: r.id,
      label: r.label,
      passes: r.passes,
      trials: r.trials,
      pass1: r.pass1,
      perTrial: r.perTrial.map((t) => ({
        trial: t.trial,
        pass: t.pass,
        reason: t.reason,
        actions: t.actions,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        durationMs: t.durationMs,
      })),
    })),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n→ wrote ${OUT}`);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
