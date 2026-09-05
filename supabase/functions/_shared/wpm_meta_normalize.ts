/**
 * Normalizes raw Meta (Messenger + Instagram) messaging events into the one
 * shape the webhook pipeline works with.
 *
 * Extracted from meta-direct-webhook/index.ts on 2026-08-31 so it can be
 * tested directly. Every other normalizer in this codebase already lives in
 * _shared (see wpm_meta_attachments.ts); this one did not, which is why the
 * echo defect below shipped untested and sat open for six days.
 */

import { describeAttachments } from './wpm_meta_attachments.ts';

/**
 * What to record for an echo we cannot read.
 *
 * WHY THIS EXISTS. PR #5 taught the pipeline to store echoes, but the caller
 * discards any event with no text 190 lines BEFORE it reaches the echo branch
 * (`meta-direct-webhook/index.ts:351` vs `:541`). An echo therefore only
 * survived if it already had words. Measured 2026-09-05 across the 66 echoes
 * since v86: **62 stored, 4 dropped**, in two distinct shapes —
 *   - 3 × an attachment `describeAttachments` has no case for
 *     (`unsupported_type`), so it returned null;
 *   - 1 × a reply to a story (2026-09-04 15:18 UTC), which arrives with
 *     `reply_to.story` and NO text and NO attachments at all, so
 *     `describeAttachments` was never even called.
 * Fixing only the attachment case would not have caught the second.
 *
 * An echo is the ONLY evidence that exists that a person replied from the
 * Instagram or Messenger app — there is no other record anywhere. So a
 * placeholder is strictly better than silence for both the Inbox and the
 * agent's context: "the owner sent something here at 16:06" is a fact the bot
 * needs in order not to talk over them.
 *
 * Deliberately scoped to echoes. An INBOUND message with nothing readable is a
 * different question — manufacturing text for one would burn an OpenAI call, a
 * reply-cap slot and a free-grant message to answer nothing, which is the trap
 * already recorded for Instagram's empty phone-card template. That behaviour is
 * left exactly as it was.
 */
function describeUnreadableEcho(
  message: NonNullable<MetaMessageEvent['message']>,
  attachments: Array<{ type: string; url: string | null }>,
): string {
  if (message.reply_to?.story) return '[Replied to a story]';
  const types = [...new Set(attachments.map((a) => a.type))].filter(Boolean);
  if (types.length > 0) return `[Sent an attachment (${types.join(', ')})]`;
  return '[Sent a message with no readable content]';
}

export interface MetaMessageEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload?: {
        url?: string;
        title?: string;
        generic?: { elements?: unknown[] };
      };
    }>;
    is_echo?: boolean;
    /**
     * Present when the message is a reply to a story. Meta sends this with no
     * `text` and no `attachments` when the reply itself carried nothing we can
     * read, which is how four of these reached us as "no text (type message)".
     */
    reply_to?: {
      story?: { id?: string; url?: string };
      mid?: string;
    };
  };
  postback?: {
    mid?: string;
    title: string;
    payload: string;
  };
  read?: { watermark: number };
  delivery?: { watermarks: number };
}

export interface NormalizedMetaPayload {
  platform: 'messenger' | 'instagram';
  pageId: string;
  /**
   * Always the CUSTOMER, never the page.
   *
   * On an inbound message the customer is `sender`. On an echo — a message the
   * business sent — Meta swaps them: `sender` is the page and `recipient` is
   * the customer. Reading `sender.id` unconditionally would key the
   * conversation as `pageId:pageId` and strand every echo in a thread
   * belonging to nobody.
   */
  senderId: string;
  messageId: string | null;
  text: string | null;
  attachments: Array<{ type: string; url: string | null }>;
  rawEventType: string;
  timestamp: number;
  /**
   * True when the business sent this message, not the customer.
   *
   * Echoes cover BOTH our own API sends (the AI's replies and Inbox replies,
   * which we already record) and messages typed by a person straight into the
   * Instagram or Messenger app, which nothing else can ever tell us about.
   * The caller is responsible for de-duplicating the former by message id.
   */
  isEcho: boolean;
}

export function normalizeMetaEvents(
  entry: { id: string; messaging?: MetaMessageEvent[] },
  platform: 'messenger' | 'instagram',
): NormalizedMetaPayload[] {
  const results: NormalizedMetaPayload[] = [];

  for (const event of entry.messaging ?? []) {
    // Delivery and read receipts carry no content and never will.
    //
    // Echoes used to be discarded on this same line. They are not noise: a
    // reply typed in the Instagram app reaches us ONLY as an echo, so dropping
    // them made the Inbox an incomplete record and — worse — hid those replies
    // from the agent's own context, which is built from wpm_messages. The bot
    // would then answer as though the colleague had never spoken.
    if (event.delivery || event.read) continue;

    const isEcho = event.message?.is_echo === true;

    let text: string | null = null;
    let messageId: string | null = null;
    let rawEventType = 'unknown';
    let attachments: Array<{ type: string; url: string | null }> = [];

    if (event.message) {
      text = event.message.text ?? null;
      messageId = event.message.mid ?? null;
      rawEventType = 'message';
      attachments = (event.message.attachments ?? []).map((a) => ({
        type: a.type ?? 'attachment',
        url: a.payload?.url ?? null,
      }));
      // Attachment-only messages (images, audio, shares, story replies) must
      // still reach the pipeline so the conversation is logged and answered.
      if (!text && attachments.length > 0) {
        text = describeAttachments(event.message.attachments ?? []);
      }
      // See describeUnreadableEcho: without this an echo we cannot read is
      // dropped by the caller's text guard and the reply typed on someone's
      // phone exists nowhere at all.
      if (!text && isEcho) {
        text = describeUnreadableEcho(event.message, attachments);
      }
    } else if (event.postback) {
      text = event.postback.payload ?? event.postback.title;
      messageId = event.postback.mid ?? null;
      rawEventType = 'postback';
    }

    results.push({
      platform,
      pageId: entry.id,
      // See the senderId doc comment: an echo's customer is the recipient.
      senderId: isEcho ? event.recipient.id : event.sender.id,
      messageId,
      text,
      attachments,
      rawEventType,
      timestamp: event.timestamp ?? Date.now(),
      isEcho,
    });
  }

  return results;
}
