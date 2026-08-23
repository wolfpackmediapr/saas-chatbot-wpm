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
export function describeAttachments(
  attachments: Array<{ type: string; payload?: { url?: string; title?: string; generic?: { elements?: unknown[] } } }>,
): string | null {
  const parts: string[] = [];

  for (const attachment of attachments) {
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
