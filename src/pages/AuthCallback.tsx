import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing sign in...');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      if (!supabase) {
        setStatus('error');
        setMessage('Supabase not configured');
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data?.session) {
          setStatus('success');
          setMessage('Signed in successfully! Redirecting...');
          setTimeout(() => navigate('/dashboard/channel-connections'), 1500);
        } else {
          setTimeout(async () => {
            const { data: retryData, error: retryError } = await supabase.auth.getSession();
            if (retryError) throw retryError;
            if (retryData?.session) {
              setStatus('success');
              setMessage('Signed in successfully! Redirecting...');
              setTimeout(() => navigate('/dashboard/channel-connections'), 1500);
            } else {
              setStatus('error');
              setMessage('No session found after OAuth redirect');
            }
          }, 1000);
        }
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setStatus('error');
        setMessage('Authentication failed');
        setErrorDetails(err.message);
      }
    }

    handleCallback();
  }, [navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-secondary-foreground">{message}</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">{message}</h2>
          <p className="text-secondary-foreground">Taking you to Channel Connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">{message}</h2>
        <p className="text-secondary-foreground mb-4">
          Something went wrong during sign in. Please try again.
        </p>
        {errorDetails && (
          <pre className="text-xs text-red-400 bg-background p-4 rounded-lg text-left overflow-auto">
            {errorDetails}
          </pre>
        )}
        <button
          onClick={() => navigate('/dashboard/channel-connections')}
          className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          Go to Channel Connections
        </button>
      </div>
    </div>
  );
}