import React from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ForgotPasswordFormProps {
  onSubmit: (email: string) => void;
  isLoading: boolean;
}

export default function ForgotPasswordForm({ onSubmit, isLoading }: ForgotPasswordFormProps) {
  const [email, setEmail] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1.5">
          Email Address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary-foreground" />
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={cn(
              "w-full pl-10 pr-4 py-2 bg-secondary/50 rounded-lg",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "placeholder:text-secondary-foreground"
            )}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "w-full mt-6 px-4 py-2 rounded-lg flex items-center justify-center gap-2",
          "bg-primary hover:bg-primary-hover text-white transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isLoading ? (
          <>Processing...</>
        ) : (
          <>
            Reset Password
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}