const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/g;

export interface TextSegment {
  type: 'text' | 'link';
  content: string;
  url?: string;
}

function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('www.')) {
    return `https://${url}`;
  }
  return `https://${url}`;
}

export function parseTextWithLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const matches = Array.from(text.matchAll(URL_REGEX));

  matches.forEach((match) => {
    const matchedUrl = match[0];
    const matchIndex = match.index!;

    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, matchIndex),
      });
    }

    segments.push({
      type: 'link',
      content: matchedUrl,
      url: normalizeUrl(matchedUrl),
    });

    lastIndex = matchIndex + matchedUrl.length;
  });

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}
