import React from 'react';
import { Github, Twitter } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SocialButtonProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}

function SocialButton({ icon: Icon, label, onClick }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full px-4 py-2 rounded-lg",
        "bg-secondary hover:bg-secondary/70 transition-colors",
        "flex items-center justify-center gap-2"
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

export default function SocialSignup() {
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-secondary"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-background text-secondary-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SocialButton
          icon={Github}
          label="GitHub"
          onClick={() => console.log('GitHub signup')}
        />
        <SocialButton
          icon={Twitter}
          label="Twitter"
          onClick={() => console.log('Twitter signup')}
        />
      </div>
    </div>
  );
}