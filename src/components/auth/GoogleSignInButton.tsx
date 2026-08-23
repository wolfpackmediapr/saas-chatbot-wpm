import React from 'react';
import { Loader2 } from 'lucide-react';
import { signInWithGoogle } from '../../lib/supabase/auth';
import { useGoogleAuthEnabled } from '../../lib/supabase/authProviders';
import { cn } from '../../lib/utils';

/**
 * "Continue with Google" — identical on Login and Signup, because with OAuth
 * the two are the same call. Google returns a session either way and
 * `getOwnedWpmClient()` creates the client and default agent on first load.
 *
 * Renders nothing at all until the project is confirmed to have the Google
 * provider enabled. `signInWithOAuth` navigates the browser rather than calling
 * the server, so a disabled provider dumps the user on a raw 400 JSON page that
 * no error handling here could intercept. See `authProviders.ts`.
 *
 * On success this component never returns: the browser leaves for Google's
 * consent screen, so `loading` stays true until navigation happens. Only a
 * failure to *start* the flow lands back here.
 */
export default function GoogleSignInButton({
  label = 'Continue with Google',
  onError,
  withDivider = false,
}: {
  label?: string;
  onError?: (message: string) => void;
  /** Render the "or" rule beneath the button. It has to be owned here, or the
   *  pages are left showing a lone divider whenever the button is hidden. */
  withDivider?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);
  const googleEnabled = useGoogleAuthEnabled();

  const handleClick = async () => {
    setLoading(true);
    onError?.('');
    try {
      await signInWithGoogle();
      // Redirect is in flight — deliberately leave `loading` true so the button
      // cannot be pressed twice while the page is on its way out.
    } catch (err) {
      setLoading(false);
      onError?.(
        err instanceof Error ? err.message : 'Could not start Google sign-in.',
      );
    }
  };

  // undefined = still asking; false = not configured. Either way, show nothing
  // rather than a button that cannot work.
  if (!googleEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2.5",
          "bg-white text-[#1f1f1f] font-medium border border-black/10",
          "hover:bg-white/90 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleMark className="h-[18px] w-[18px]" />
        )}
        {loading ? 'Redirecting…' : label}
      </button>
      {withDivider && <AuthDivider />}
    </>
  );
}

/**
 * Google's mark, inlined. Google's branding guidelines require the official
 * four-colour "G"; loading it from gstatic would put a third-party request on
 * the sign-in page for an 800-byte image.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

/** Small "or" rule, so both auth pages separate the two methods the same way. */
export function AuthDivider({
  children = 'or',
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-secondary-foreground/20" />
      <span className="text-xs uppercase tracking-wide text-secondary-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-secondary-foreground/20" />
    </div>
  );
}
