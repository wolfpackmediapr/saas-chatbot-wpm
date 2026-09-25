/**
 * Turning an inbound Meta attachment into words the agent can answer.
 *
 * Lives here rather than in meta-direct-webhook so it can be type-checked and
 * tested on its own -- the same reason fetchMetaUserProfile was moved out, and
 * that move is what let nine tests pin the Facebook name bug in place.
 */

/** Captions can run to a thousand words; enough to answer, not enough to bloat. */
const MAX_SHARED_CAPTION = 1200;

/**
 * Turn an attachment-only delivery into something the agent can actually answer.
 *
 * This used to be `[User sent: ${types}]` — the attachment TYPE and nothing
 * else. For 74 shared reels and posts that discarded the entire caption, which
 * Meta hands us in `payload.title`, and every one of them got the same dead
 * reply: "Eso es una gran pregunta — me aseguraré de que alguien de nuestro
 * equipo te siga con ese detalle." The customer had shared something specific
 * and the agent had literally nothing to read.
 *
 * Returns null when a delivery genuinely carries no content, so the caller
 * records it as `ignored` instead of paying for a completion that answers
 * nothing.
 */
type MetaAttachment = {
  type: string;
  payload?: { url?: string; title?: string; sticker_id?: number | string; generic?: { elements?: unknown[] } };
};

/**
 * Messenger's thumbs-up. Pressing the like button sends Facebook's fixed like
 * sticker — small, medium and large are three ids — as an attachment of type
 * `image` (plus a duplicate of type `sticker`). Read by type alone it is "a
 * photo", and hard rule 9 tells the agent a shared photo is interest: a lead
 * who had already said goodbye got a Discovery Flight pitch in reply to his 👍
 * (Skywake, 2026-09-24 and 09-25, sticker 369239263222822 both times).
 */
export const LIKE_STICKER_IDS = new Set(['369239263222822', '369239343222814', '369239383222810']);

/**
 * A like: Messenger's like sticker, or Instagram's quick-like heart
 * (`like_heart`, Meta's documented type — never yet observed on our pages).
 */
export function isLikeAttachment(attachment: MetaAttachment): boolean {
  if (attachment.type === 'like_heart') return true;
  const stickerId = attachment.payload?.sticker_id;
  return stickerId !== undefined && stickerId !== null && LIKE_STICKER_IDS.has(String(stickerId));
}

/**
 * True when a delivery is ONLY a like — an acknowledgement, not a message.
 * The caller records it and does not answer: a thumbs-up at the end of a
 * thread is the customer closing it, and any reply re-opens it.
 */
export function isAcknowledgementOnly(text: string | null | undefined, attachments: MetaAttachment[]): boolean {
  if (text?.trim()) return false;
  return attachments.length > 0 && attachments.every(isLikeAttachment);
}

export function describeAttachments(
  attachments: MetaAttachment[],
): string | null {
  const parts: string[] = [];
  let likeDescribed = false;

  for (const attachment of attachments) {
    // Before the type switch: a like arrives typed as `image`.
    if (isLikeAttachment(attachment)) {
      if (!likeDescribed) parts.push('[Sent a 👍]'); // image + sticker are ONE like
      likeDescribed = true;
      continue;
    }

    const title = attachment.payload?.title?.trim();
    const caption = title ? ` ${title.slice(0, MAX_SHARED_CAPTION)}` : '';

    switch (attachment.type) {
      case 'ig_reel':
        parts.push(`[Shared an Instagram reel]${caption}`);
        break;
      case 'ig_post':
        parts.push(`[Shared an Instagram post]${caption}`);
        break;
      case 'story_mention':
        // They put the business in front of their own followers. That deserves
        // a real reply, not a generic one.
        parts.push('[Mentioned this business in their Instagram story]');
        break;
      case 'image':
        // The picture itself goes to the vision model separately; this is what
        // the Inbox shows a human, so it should not read like an error.
        parts.push('[Sent a photo]');
        break;
      case 'audio':
        // Replaced with the Whisper transcript further down the pipeline.
        parts.push('[Sent a voice message]');
        break;
      case 'video':
        parts.push('[Sent a video]');
        break;
      case 'file':
        parts.push('[Sent a file]');
        break;
      case 'template':
        // Instagram's phone/WhatsApp/Call card: `generic.elements` is empty,
        // because the widget is rendered client-side. There is nothing here to
        // answer, so contribute nothing.
        if (attachment.payload?.generic?.elements?.length) {
          parts.push('[Sent a card]');
        }
        break;
      case 'sticker':
        break; // a sticker beside a photo adds nothing to describe
      default:
        if (title) parts.push(`[Shared something]${caption}`);
        break;
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n');
}
