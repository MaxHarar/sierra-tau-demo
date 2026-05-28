/**
 * Sierra chat route (TDD § 4.1). Streams an Anthropic-backed tool-using
 * agent loop using the AI SDK v6 `streamText` primitive.
 *
 * Per-turn guard order is rate limit → daily budget → run. The rate
 * limit responds 429 with `X-RateLimit-Remaining` / `X-RateLimit-Reset`;
 * the budget cap responds 503 with a plain-text message so the demo
 * fails closed if costs spike.
 *
 * Notable v6 adaptation vs the TDD prose: `streamText` requires
 * `ModelMessage[]`, not `UIMessage[]`. We convert via
 * `convertToModelMessages(messages)` before passing them in. Tool input
 * schemas live on each tool's `inputSchema`, which is the v6 field
 * name (the older `parameters` field was renamed).
 *
 * Logging policy (TDD § 17): metadata only. Never log message content,
 * tool inputs, or full IPs — the IP is SHA-256 hashed before emission.
 */

import { streamText, stepCountIs, convertToModelMessages } from 'ai';
import type { UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { headers } from 'next/headers';
import { z } from 'zod';
import { ratelimit } from '@/lib/sierra/ratelimit';
import { dailyBudget } from '@/lib/sierra/budget';
import { getWorld } from '@/lib/sierra/world';
import { airlineTools } from '@/lib/sierra/tools';
import { getAirlineWiki } from '@/lib/sierra/wiki';
import { CONFIG } from '@/lib/sierra/config';
import { log, hashIp } from '@/lib/sierra/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

// sessionId is allowed empty here because the client's useSyncExternalStore
// returns '' on the SSR snapshot and the production hydration window can race
// the first chip click. We fall back to an IP-derived default below — the
// session cache then just collapses to one slot per visitor for the very
// first turn, which is harmless. Anything > 128 chars is still rejected.
const ChatBodySchema = z.object({
  messages: z.array(z.any()),
  sessionId: z.string().max(128).optional().default(''),
});

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const h = await headers();
  const forwarded = h.get('x-forwarded-for') ?? '127.0.0.1';
  const ip = forwarded.split(',')[0]?.trim() ?? '127.0.0.1';

  // Guard 1 — per-IP sliding-window rate limit. Fail CLOSED on infra error.
  let rlSuccess: boolean;
  let rlRemaining: number;
  let rlReset: number;
  try {
    const r = await ratelimit.limit(ip);
    rlSuccess = r.success;
    rlRemaining = r.remaining;
    rlReset = r.reset;
  } catch (err) {
    log({
      event: 'ratelimit_error',
      ip_hash: hashIp(ip),
      err: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({ code: 'INFRA_ERROR', message: 'Rate limiter unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!rlSuccess) {
    return new Response(
      JSON.stringify({ code: 'RATE_LIMITED', message: 'Rate limit exceeded' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rlRemaining),
          'X-RateLimit-Reset': String(rlReset),
        },
      },
    );
  }

  // Guard 2 — daily token-cost cap. Fail CLOSED on infra error.
  let budgetExceeded: boolean;
  try {
    budgetExceeded = await dailyBudget.exceeded();
  } catch (err) {
    log({
      event: 'budget_check_failed',
      ip_hash: hashIp(ip),
      err: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({ code: 'INFRA_ERROR', message: 'Budget service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (budgetExceeded) {
    return new Response(
      JSON.stringify({
        code: 'BUDGET_EXCEEDED',
        message: 'Daily demo budget reached. Try again tomorrow.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Validate request body with Zod. We only constrain `sessionId` shape;
  // `messages` is array-of-any because AI SDK's `convertToModelMessages`
  // validates the UIMessage shape downstream.
  let body: { messages: UIMessage[]; sessionId: string };
  try {
    const raw = await req.json();
    body = ChatBodySchema.parse(raw) as { messages: UIMessage[]; sessionId: string };
  } catch (err) {
    log({ event: 'bad_request', err: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ code: 'BAD_REQUEST', message: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const { messages, sessionId: providedSessionId } = body;
  // Fall back to an IP-derived default when the client hasn't hydrated its
  // localStorage sessionId yet. The cache simply collapses to one slot per IP
  // for the very first turn — corrects itself on subsequent turns.
  const sessionId = providedSessionId && providedSessionId.length > 0
    ? providedSessionId
    : `anon-${hashIp(ip)}`;
  const world = getWorld(sessionId, messages);
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic(CONFIG.modelId),
    system: getAirlineWiki(),
    messages: modelMessages,
    tools: airlineTools(world),
    stopWhen: stepCountIs(CONFIG.stopAfterSteps),
    onError: ({ error }) => {
      log({
        event: 'stream_error',
        sessionId,
        ip_hash: hashIp(ip),
        err: error instanceof Error ? error.message : String(error),
      });
    },
    onFinish: async ({ usage }) => {
      const inputTokens = usage?.inputTokens ?? 0;
      const outputTokens = usage?.outputTokens ?? 0;
      try {
        await dailyBudget.charge(inputTokens, outputTokens);
      } catch (err) {
        // Don't fail the user response, but emit a forensic signal so a
        // silent bookkeeping failure can't burn through the cap unnoticed.
        log({
          event: 'budget_charge_failed',
          sessionId,
          ip_hash: hashIp(ip),
          inputTokens,
          outputTokens,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      log({
        event: 'turn_complete',
        sessionId,
        ip_hash: hashIp(ip),
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
        status: 'ok',
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
