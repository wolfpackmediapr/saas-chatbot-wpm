-- Retry state for outbound lead deliveries.
--
-- `wpm_tool_executions` was already an outbox table in every respect except
-- that nothing drained it and a single failure was terminal: the processor
-- marked a row `failed` on any non-2xx and only ever selected `pending`, so a
-- transient 503 from Zapier permanently lost a qualified lead.
--
-- These two columns let a retryable failure stay in the queue with a backoff
-- instead of being destroyed.

alter table public.wpm_tool_executions
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

comment on column public.wpm_tool_executions.attempt_count is
  'Delivery attempts made. Config problems (no webhook URL yet) deliberately do not consume one.';

comment on column public.wpm_tool_executions.next_attempt_at is
  'Earliest time the drain may retry this row. NULL means it has never been attempted.';

-- The drain reads exactly this shape: pending rows that are due, oldest first.
create index if not exists idx_wpm_tool_executions_due
  on public.wpm_tool_executions (next_attempt_at, created_at)
  where status = 'pending';
