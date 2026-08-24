import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { updatePassword } from '../lib/supabase/auth';
import LegalFooter from '../components/LegalFooter';
import PasswordInput from '../components/ui/PasswordInput';

/**
 * Where a password-reset email actually lands.
 *
 * `resetPassword()` has always pointed its redirect at /reset-password, and
 * until now no such route existed — the catch-all sent everyone who clicked
 * the link to the marketing homepage. Anyone who forgot their password could
 * not get back into their account at all.
 *
 * The client runs with `detectSessionInUrl: true`, so supabase-js consumes the
 * recovery token and establishes a session before this component mounts. That
 * session is enough to call `updateUser({ password })` and no more, which is
 * why the form asks only for the new password and never the old one.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!supabase) {
        if (!cancelled) { setError('Service is not configured. Please contact support.'); setChecking(false); }
        return;
      }

      // An expired or already-used link comes back as an error in the URL
      // fragment rather than as a session, and says so precisely.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const urlError = hash.get('error_description') ?? hash.get('error');
      if (urlError) {
        if (!cancelled) {
          setError(urlError.replace(/\+/g, ' '));
          setChecking(false);
        }
        return;
      }

      // detectSessionInUrl processes the token asynchronously; one retry covers
      // the case where this mounts first.
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        await new Promise((r) => setTimeout(r, 700));
        ({ data } = await supabase.auth.getSession());
      }

      if (cancelled) return;
      setLinkValid(Boolean(data.session));
      if (!data.session) {
        setError('This reset link has expired or has already been used.');
      }
      setChecking(false);
    }

    check();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await updatePassword(newPassword);
      // The recovery session is a real session, so there is nothing left to do
      // but go in.
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 mb-8">
              <img
                src="/WolfPack_Media_AI_logo_only_icon.png"
                alt="WolfPack AI"
                className="h-10 w-10 rounded-lg bg-white object-contain p-0.5 shadow-sm"
              />
              <span className="text-xl font-semibold">WolfPack Media AI</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Choose a new password</h1>
            <p className="text-sm text-secondary-foreground">
              You'll be signed in as soon as it's saved.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-secondary/50 rounded-xl p-6 backdrop-blur-sm"
          >
            {checking ? (
              <div className="flex items-center justify-center gap-2 py-6 text-secondary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking your link…
              </div>
            ) : !linkValid ? (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-secondary-foreground mb-5">{error}</p>
                <Link
                  to="/forgot-password"
                  className="inline-block px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Send a new link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">{error}</div>
                )}

                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">
                    New password
                  </label>
                  <PasswordInput
                    id="new-password"
                    autoComplete="new-password"
                    autoFocus
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">
                    Confirm new password
                  </label>
                  <PasswordInput
                    id="confirm-password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Type it again"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save password and sign in'}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
      <LegalFooter variant="compact" className="py-6 px-6" />
    </div>
  );
}
