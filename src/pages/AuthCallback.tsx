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
        // If running in a popup, send error back to parent
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(
            { type: 'META_OAUTH_ERROR', error: 'Supabase not configured' },
            window.location.origin
          );
          window.close();
          return;
        }
        setStatus('error');
        setMessage('Supabase not configured');
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        let session = data?.session;

        if (!session) {
          await new Promise(r => setTimeout(r, 1000));
          const { data: retryData, error: retryError } = await supabase.auth.getSession();
          if (retryError) throw retryError;
          session = retryData?.session ?? null;
        }

        if (!session) {
          const msg = 'No session found after OAuth redirect';
          if (window.opener && window.opener !== window) {
            window.opener.postMessage(
              { type: 'META_OAUTH_ERROR', error: msg },
              window.location.origin
            );
            window.close();
            return;
          }
          setStatus('error');
          setMessage(msg);
          return;
        }

        const isFacebookOAuth =
          session.provider_token &&
          (session.user.app_metadata?.provider === 'facebook' ||
            (session.user.identities as any[])?.some((i) => i.provider === 'facebook'));

        // Popup mode: send token back to parent, let parent handle page selection + save
        if (isFacebookOAuth && window.opener && window.opener !== window) {
          window.opener.postMessage(
            {
              type: 'META_OAUTH_SUCCESS',
              provider_token: session.provider_token,
              user_id: session.user.id,
            },
            window.location.origin
          );
          window.close();
          return;
        }

        // Full-page fallback: call meta-oauth-callback directly (connects all pages)
        if (isFacebookOAuth) {
          setMessage('Connecting your Facebook Pages...');

          const { data: fnData, error: fnError } = await supabase.functions.invoke(
            'meta-oauth-callback',
            {
              body: {
                user_token: session.provider_token,
                supabase_user_id: session.user.id,
              },
            }
          );

          if (fnError || !fnData?.success) {
            const msg = fnData?.error || fnError?.message || 'Unknown error';
            setStatus('error');
            setMessage(`Channel connection failed: ${msg}`);
            setErrorDetails(
              'Your Facebook login succeeded but the channel could not be saved. ' +
                'Please try connecting again from Channel Connections.'
            );
            return;
          }

          setStatus('success');
          setMessage(
            `${fnData.pagesConnected} channel${fnData.pagesConnected !== 1 ? 's' : ''} connected!`
          );
          setTimeout(() => navigate('/dashboard/channel-connections'), 2000);
        } else {
          setStatus('success');
          setMessage('Signed in successfully! Redirecting...');
          setTimeout(() => navigate('/dashboard/channel-connections'), 1500);
        }
      } catch (err: any) {
        console.error('Auth callback error:', err);
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(
            { type: 'META_OAUTH_ERROR', error: err.message },
            window.location.origin
          );
          window.close();
          return;
        }
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
          <p className="text-secondary-foreground mt-3">Taking you to Channel Connections...</p>
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
        {errorDetails && (
          <p className="text-secondary-foreground mb-4 text-sm">{errorDetails}</p>
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
