import React from 'react';
import { parseTextWithLinks } from '../lib/linkify';

interface MessageContentProps {
  content: string;
  isUser: boolean;
}

export default function MessageContent({ content, isUser }: MessageContentProps) {
  const segments = parseTextWithLinks(content);

  return (
    <p className="text-sm text-foreground whitespace-pre-wrap break-words">
      {segments.map((segment, index) => {
        if (segment.type === 'link') {
          return (
            <a
              key={index}
              href={segment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-colors cursor-pointer"
            >
              {segment.content}
            </a>
          );
        }
        return <span key={index}>{segment.content}</span>;
      })}
    </p>
  );
}
