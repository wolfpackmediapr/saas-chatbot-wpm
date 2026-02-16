import React from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

export default function FeedbackSection() {
  return (
    <div className="text-center py-8 border-t border-secondary">
      <h3 className="text-lg font-semibold mb-4">Was this page helpful?</h3>
      <div className="flex justify-center gap-4">
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors">
          <ThumbsUp className="w-5 h-5" />
          Yes
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors">
          <ThumbsDown className="w-5 h-5" />
          No
        </button>
      </div>
    </div>
  );
}