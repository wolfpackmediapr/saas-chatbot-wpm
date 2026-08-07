import React from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import LoginForm, { LoginFormData } from '../components/auth/LoginForm';
import { signIn } from '../lib/supabase/auth';
import LegalFooter from '../components/LegalFooter';

export default function Login() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const message = location.state?.message;

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await signIn(data.email, data.password);
      if (response.user) {
        navigate('/dashboard');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
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
              <img
                src="/WolfPack_Media_AI_logo_only_icon.png"
                alt="WolfPack AI"
                className="h-9 w-9 md:h-10 md:w-10 rounded-lg bg-white object-contain p-0.5 shadow-sm"
              />
              <span className="text-lg md:text-xl font-semibold">WolfPack Media AI</span>
            </div>

            <h1 className="text-xl md:text-2xl font-bold mb-2">Welcome back</h1>
            <p className="text-sm md:text-base text-secondary-foreground">
              Sign in to your account to continue
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-secondary/50 rounded-xl p-5 md:p-6 backdrop-blur-sm"
          >
            {message && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-500 text-xs md:text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-xs md:text-sm">
                {error}
              </div>
            )}

            <LoginForm onSubmit={handleLogin} isLoading={isLoading} />

            <p className="mt-6 text-center text-xs md:text-sm text-secondary-foreground">
              Don't have an account?{' '}
              <Link
                to="/signup"
                className="text-primary hover:text-primary-hover transition-colors touch-manipulation"
              >
                Sign up
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
      <LegalFooter variant="compact" className="py-4 px-6" />
    </div>
  );
}
