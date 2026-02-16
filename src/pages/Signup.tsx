import React from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import SignupForm, { SignupFormData } from '../components/auth/SignupForm';
import { signUp } from '../lib/supabase/auth';

export default function Signup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (data: SignupFormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await signUp(data.email, data.password, data.name);
      navigate('/login', { 
        state: { message: 'Please check your email to verify your account.' } 
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6 md:mb-8"
          >
            <div className="inline-flex items-center gap-2 mb-6 md:mb-8">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Bot className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <span className="text-lg md:text-xl font-semibold">WolfPack Media AI</span>
            </div>

            <h1 className="text-xl md:text-2xl font-bold mb-2">Create your account</h1>
            <p className="text-sm md:text-base text-secondary-foreground">
              Start your journey with WolfPack Media AI
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-secondary/50 rounded-xl p-5 md:p-6 backdrop-blur-sm"
          >
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-xs md:text-sm">
                {error}
              </div>
            )}

            <SignupForm onSubmit={handleSignup} isLoading={isLoading} />

            <p className="mt-6 text-center text-xs md:text-sm text-secondary-foreground">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-primary hover:text-primary-hover transition-colors touch-manipulation"
              >
                Sign in
              </Link>
            </p>
          </motion.div>

          <p className="mt-6 md:mt-8 text-center text-xs md:text-sm text-secondary-foreground px-2">
            By signing up, you agree to our{' '}
            <a href="#" className="text-primary hover:text-primary-hover transition-colors touch-manipulation">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-primary hover:text-primary-hover transition-colors touch-manipulation">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
      <footer className="py-4 px-6 text-center text-xs md:text-sm text-muted-foreground">
        <p>© 2026 All Rights Reserved. Built by WolfPack Media LLC</p>
      </footer>
    </div>
  );
}