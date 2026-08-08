-- wpm_webhook_events.client_id was NULL on every row: meta-direct-webhook
-- inserts the event before the channel lookup (so unmatched deliveries are
-- still recorded) and nothing ever backfilled it. Two consequences:
--   1. any per-client count on this table was always 0
--   2. the "WPM users can view owned webhook events" RLS policy keys on
--      client_id, so owners could never see a single one of their own events
--
-- The pipeline fix is in meta-direct-webhook. This backfills history.
-- Attribution comes from the message the event produced (which carries the
-- conversation, and therefore the client and channel), falling back to
-- matching the Meta page id in the raw payload against the channel row.
-- Rows that resolve to neither are left NULL rather than guessed at.

WITH candidate AS (
  SELECT w.id,
         w.raw_payload #>> '{entry,0,id}' AS page_id,
         CASE WHEN w.provider = 'meta_instagram' THEN 'instagram'
              WHEN w.provider = 'meta_messenger' THEN 'facebook' END AS ch_type,
         w.external_event_id
  FROM public.wpm_webhook_events w
  WHERE w.client_id IS NULL
),
resolved AS (
  SELECT c.id,
         COALESCE(conv.client_id, ch.client_id) AS client_id,
         COALESCE(conv.channel_id, ch.id)       AS channel_id,
         conv.id                                AS conversation_id
  FROM candidate c
  LEFT JOIN public.wpm_messages m
    ON m.provider_message_id = c.external_event_id
  LEFT JOIN public.wpm_conversations conv
    ON conv.id = m.conversation_id
  LEFT JOIN public.wpm_client_channels ch
    ON ch.external_page_id = c.page_id
   AND ch.channel_type = c.ch_type
   AND ch.provider = 'meta'
)
UPDATE public.wpm_webhook_events w
SET client_id       = r.client_id,
    channel_id      = COALESCE(w.channel_id, r.channel_id),
    conversation_id = COALESCE(w.conversation_id, r.conversation_id)
FROM resolved r
WHERE w.id = r.id
  AND r.client_id IS NOT NULL;
