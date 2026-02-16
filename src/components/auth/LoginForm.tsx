import React from 'react';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface LoginFormProps {
  onSubmit: (data: LoginFormData) => void;
  isLoading: boolean;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export default function LoginForm({ onSubmit, isLoading }: LoginFormProps) {
  const [formData, setFormData] = React.useState<LoginFormData>({
    email: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
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
            name="email"
            value={formData.email}
            onChange={handleChange}
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

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <Link
            to="/forgot-password"
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary-foreground" />
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            className={cn(
              "w-full pl-10 pr-4 py-2 bg-secondary/50 rounded-lg",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "placeholder:text-secondary-foreground"
            )}
            placeholder="••••••••"
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
            Sign In
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}