'use client';

/**
 * Sierra workbench (TDD § 11.1, § 22 step 11).
 *
 * Single client island for the `/sierra` page. Owns:
 *
 *  - `useChat()` from `@ai-sdk/react` (AI SDK v6). The hook is configured with
 *    a `DefaultChatTransport` so we can pass our route `api: '/api/sierra/chat'`
 *    AND a session-scoped `body: { sessionId }` extra field. v6 dropped the
 *    `api: string` shorthand the brief described, so we wrap it ourselves.
 *  - A per-browser `sessionId` (crypto.randomUUID), persisted in
 *    `localStorage['sierra:sessionId']` so the in-memory `AirlineWorld`
 *    survives reloads of the same tab.
 *  - The three-pane grid layout on `lg:` and up; a tab switcher between
 *    Itinerary and Trace on smaller screens (chat is always full-width).
 *  - The 503 / "daily demo budget reached" path — render `<BudgetBanner />`
 *    in place of `<ChatPane />` when the API returned 503.
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { CHIPS } from '@/content/sierra/chips';
import { BudgetBanner } from './BudgetBanner';
import { ChatPane } from './ChatPane';
import { ChipRow } from './ChipRow';
import { FlowPane } from './FlowPane';
import { TracePane } from './TracePane';

const SESSION_KEY = 'sierra:sessionId';

function noopSubscribe(): () => void {
  return () => {};
}

function readSessionId(): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing && existing.length > 0) return existing;
  const fresh =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sierra-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  window.localStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}

export function Workbench() {
  // Pull (and lazily seed) the per-browser sessionId from localStorage. We
  // use `useSyncExternalStore` so React renders consistently between the
  // SSR pass (empty string) and post-hydration (real id) without triggering
  // the `react-hooks/set-state-in-effect` lint rule that `useEffect`
  // approaches do.
  const sessionId = useSyncExternalStore(
    noopSubscribe,
    readSessionId,
    () => '',
  );

  const transport = useMemo<DefaultChatTransport<UIMessage>>(
    () =>
      new DefaultChatTransport({
        api: '/api/sierra/chat',
        body: () => ({ sessionId }),
      }),
    [sessionId],
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({ transport });

  const [tab, setTab] = useState<'itinerary' | 'trace'>('itinerary');

  // The API now returns JSON `{code, message}` bodies for all error paths.
  // Parse the embedded JSON when present; fall back to substring matching
  // for back-compat with any older plain-text bodies still in flight.
  const errorCode = useMemo<string | null>(() => {
    if (status !== 'error' || typeof error?.message !== 'string') return null;
    const m = error.message.match(/\{[^}]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]) as { code?: unknown };
        if (typeof parsed.code === 'string') return parsed.code;
      } catch {
        /* fall through to substring fallback */
      }
    }
    if (/budget/i.test(error.message)) return 'BUDGET_EXCEEDED';
    if (/rate/i.test(error.message)) return 'RATE_LIMITED';
    return 'UNKNOWN_ERROR';
  }, [status, error]);

  const budgetReached = errorCode === 'BUDGET_EXCEEDED';

  function handlePick(prompt: string) {
    if (status === 'streaming' || status === 'submitted') return;
    // Each chip is a fresh demo trial — clear the prior conversation so the
    // panel doesn't grow unbounded across chip switches.
    setMessages([]);
    void sendMessage({ text: prompt });
  }

  function handleSubmit(text: string) {
    void sendMessage({ text });
  }

  if (budgetReached) {
    return (
      <div className="mx-auto max-w-2xl">
        <BudgetBanner />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-md border border-border bg-code-bg p-4 text-sm text-foreground">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1 text-secondary">
            {errorCode === 'RATE_LIMITED'
              ? "You're sending requests faster than the demo allows. Wait a moment, then try again."
              : 'The demo encountered an error. Try again in a moment.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md border border-accent px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-background"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
      <section
        role="region"
        aria-label="chat"
        className="flex min-w-0 flex-col gap-3"
      >
        <ChipRow
          chips={CHIPS}
          onPick={handlePick}
          disabled={status === 'streaming' || status === 'submitted'}
        />
        <ChatPane
          messages={messages}
          onSubmit={handleSubmit}
          status={status}
        />
      </section>

      {/* Desktop: render both side panes directly. */}
      <section
        role="region"
        aria-label="itinerary"
        className="hidden min-w-0 lg:block"
      >
        <FlowPane messages={messages} />
      </section>
      <section
        role="region"
        aria-label="trace"
        className="hidden min-w-0 lg:block"
      >
        <TracePane messages={messages} />
      </section>

      {/* Mobile/tablet: tab switcher between Itinerary and Trace. */}
      <div className="min-w-0 lg:hidden">
        <div role="tablist" className="mb-2 flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'itinerary'}
            onClick={() => setTab('itinerary')}
            className={`rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
              tab === 'itinerary'
                ? 'border-accent text-foreground'
                : 'border-border text-secondary hover:text-foreground'
            }`}
          >
            Itinerary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'trace'}
            onClick={() => setTab('trace')}
            className={`rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
              tab === 'trace'
                ? 'border-accent text-foreground'
                : 'border-border text-secondary hover:text-foreground'
            }`}
          >
            Trace
          </button>
        </div>
        {tab === 'itinerary' ? (
          <section role="region" aria-label="itinerary (mobile)">
            <FlowPane messages={messages} />
          </section>
        ) : (
          <section role="region" aria-label="trace (mobile)">
            <TracePane messages={messages} />
          </section>
        )}
      </div>
    </div>
  );
}
