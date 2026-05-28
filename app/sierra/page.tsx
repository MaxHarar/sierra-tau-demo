import type { Metadata } from 'next';
import { Workbench } from '@/components/sierra/Workbench';
import passOne from '@/app/sierra/data/pass1.json';

/**
 * Sierra / Pass^1 demo page (TDD § 10).
 *
 * Server component. Composes the prose intro + the fullbleed workbench
 * client island + the methodology block with the real pass^1 score read
 * from `app/sierra/data/pass1.json` (produced by `scripts/sierra-eval.ts`).
 */
export const metadata: Metadata = {
  title: 'Pass^1',
  description:
    "A τ-airline customer-service agent built against Sierra's open benchmark.",
};

const generatedAt = new Date(passOne.generatedAt).toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export default function SierraPage() {
  return (
    <>
      <article className="prose">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-heading text-5xl tracking-tight bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] bg-clip-text text-transparent">
            Pass^1
          </h1>
          <span
            className="rounded-full border border-accent px-3 py-1 font-mono text-sm text-accent"
            aria-label={`pass^1 score ${passOne.aggregate.toFixed(3)} over ${passOne.attemptsPerTask} attempts across ${passOne.tasks.length} tasks`}
          >
            = {passOne.aggregate.toFixed(3)}
          </span>
        </div>
        <p className="text-secondary">
          A working customer-service agent for Sierra&apos;s own τ-bench
          airline domain. Built in two days. Stack: Claude Sonnet 4.5,
          Vercel AI SDK v6, Upstash, Next.js 16.
        </p>
        <p>
          τ-bench is Sierra&apos;s open agent-reliability benchmark — seeded
          users, flights, reservations, and policies in a fixed domain.
          &ldquo;Pass^1&rdquo; is the probability the agent passes a single
          attempt; &ldquo;pass^k&rdquo; is the probability it passes{' '}
          <em>every</em> attempt across k i.i.d. trials. This page exposes 5
          representative tasks against the airline domain. Try the chips
          below, or type your own request.
        </p>
      </article>

      <section className="sierra-workbench-fullbleed">
        <Workbench />
      </section>

      <article className="prose">
        <h2>Methodology</h2>
        <p>
          The badge above is the aggregate pass^1 across the 5 canonical
          tasks listed below, n = {passOne.attemptsPerTask} attempts per
          task, model <code>{passOne.model}</code>, measured{' '}
          {generatedAt}. Each trial spins up a fresh τ-bench corpus,
          replays via the same agent loop the chat panel uses, and scores
          on final database state — not on the prose of the assistant
          reply.
        </p>
        <ul className="font-mono text-sm">
          {passOne.tasks.map((t) => (
            <li key={t.id} className="flex justify-between gap-4">
              <span className="text-secondary">{t.label}</span>
              <span className="tabular-nums text-foreground">
                {t.pass1.toFixed(3)}{' '}
                <span className="text-tertiary">
                  ({t.passes}/{t.trials})
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-secondary text-sm">
          Sierra&apos;s published τ-bench leaderboard does not include a
          Sonnet 4.5 number; the widely-cited figure (pass^1 ≈ 0.700) is
          from third-party aggregators. The number above is our own
          measurement on these 5 tasks, not a re-run of Sierra&apos;s full
          50-task suite. Eval script:{' '}
          <code>scripts/sierra-eval.ts</code>.
        </p>
        <p className="text-secondary text-sm">
          <strong>What the score actually means here.</strong> The τ-airline
          policy mandates explicit user confirmation before any mutating
          tool call. Our eval uses a multi-turn loop (up to 4 turns per
          trial) with a regex-based auto-confirmer that recognises common
          confirmation prompts and responds. The cancel chip lifts to 2/3
          this way. The change-flight chip stays at 0/3 because Mia
          Li&apos;s prompt is genuinely ambiguous about which of her three
          reservations to modify — a heuristic auto-confirmer can&apos;t
          pick a candidate the way a real user would. The three
          non-mutating chips (refusal, lookup, contradiction handling)
          score 1.000 each: the agent stays on-policy in every trial. A
          full τ-bench-style simulated-user LLM that holds task intent
          across turns is the right next step (v1.1) — it would lift the
          change-flight chip without changing the agent.
        </p>

        <h2>What&apos;s inside</h2>
        <p>
          Eight Zod-typed tools, in-memory τ-bench corpus per session, no
          real bookings, honest pass^1 scoring. Open-source companion repo
          at{' '}
          <a
            href="https://github.com/MaxHarar/sierra-tau-demo"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/MaxHarar/sierra-tau-demo
          </a>
          .
        </p>
        <p className="text-secondary text-sm">
          Day job: shipped a similar agent for medical demand packets at
          CURE — same kind of reliability problem, different domain.
        </p>
      </article>
    </>
  );
}
