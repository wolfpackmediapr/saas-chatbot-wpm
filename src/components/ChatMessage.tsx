import React from 'react';
import { User, Bot } from 'lucide-react';
import { cn } from '../lib/utils';
import MessageContent from './MessageContent';

interface ChatMessageProps {
  content: string;
  isUser: boolean;
  images?: string[];
}

export default function ChatMessage({ content, isUser, images }: ChatMessageProps) {
  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        isUser ? 'flex-row-reverse bg-secondary/30' : 'bg-secondary/10'
      )}
    >
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary' : 'bg-accent'
      )}>
        {isUser ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
      </div>
      <div className={cn(
        'flex-1 space-y-2',
        isUser ? 'text-right' : 'text-left'
      )}>
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((image, index) => (
              <img
                key={index}
                src={image}
                alt={`Uploaded ${index + 1}`}
                className="max-w-xs rounded-lg"
              />
            ))}
          </div>
        )}
        <MessageContent content={content} isUser={isUser} />
      </div>
    </div>
  );
}