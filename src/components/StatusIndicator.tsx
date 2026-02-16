import React from 'react';
import { cn } from '../lib/utils';

interface StatusIndicatorProps {
  status: 'online' | 'typing' | 'offline';
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        "h-2 w-2 rounded-full",
        status === 'online' && "bg-green-500",
        status === 'typing' && "bg-yellow-500",
        status === 'offline' && "bg-red-500"
      )} />
      <span className="text-sm text-secondary-foreground">
        {status === 'online' && 'Assistant is Online'}
        {status === 'typing' && 'Assistant is Typing...'}
        {status === 'offline' && 'Assistant is Offline'}
      </span>
    </div>
  );
}