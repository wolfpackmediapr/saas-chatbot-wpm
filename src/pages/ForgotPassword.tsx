import React from 'react';
import { motion } from 'framer-motion';
import { Bot, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm';
import { resetPassword } from '../lib/supabase/auth';

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isEmailSent, setIsEmailSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await resetPassword(email);
      setIsEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-secondary-foreground hover:text-primary transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 mb-8">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-semibold">WolfPack Media AI</span>
            </div>

            <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
            <p className="text-secondary-foreground">
              Enter your email address and we'll send you instructions to reset your password
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-secondary/50 rounded-xl p-6 backdrop-blur-sm"
          >
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                {error}
              </div>
            )}

            {isEmailSent ? (
              <div className="text-center py-4">
                <h2 className="text-xl font-semibold mb-2">Check your email</h2>
                <p className="text-secondary-foreground mb-4">
                  We've sent password reset instructions to your email address.
                </p>
                <Link
                  to="/login"
                  className="text-primary hover:text-primary-hover transition-colors"
                >
                  Return to login
                </Link>
              </div>
            ) : (
              <ForgotPasswordForm onSubmit={handleSubmit} isLoading={isLoading} />
            )}
          </motion.div>
        </div>
      </div>
      <footer className="py-4 px-6 text-center text-sm text-muted-foreground">
        <p>© 2026 All Rights Reserved. Built by WolfPack Media LLC</p>
      </footer>
    </div>
  );
}