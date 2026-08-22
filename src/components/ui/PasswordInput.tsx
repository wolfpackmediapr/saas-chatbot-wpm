import React, { useId, useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Renders the lock glyph on the left, matching the auth form fields. */
  withLockIcon?: boolean;
}

/**
 * A password field you can unmask.
 *
 * Typing a password blind is the main reason people fail a login they actually
 * know, and it is worse on phones where autocorrect and a cramped keyboard make
 * mistakes likely. Settings already offered this; the auth forms — where it
 * matters most, because a new user is inventing a password rather than
 * recalling one — did not.
 *
 * The toggle is `tabIndex={-1}` so tabbing runs email -> password -> submit
 * rather than stopping on a control most people never use.
 */
export default function PasswordInput({
  withLockIcon = true,
  className,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;

  return (
    <div className="relative">
      {withLockIcon && (
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-secondary-foreground pointer-events-none" />
      )}
      <input
        {...props}
        id={id}
        type={visible ? 'text' : 'password'}
        className={cn(
          'w-full py-2 bg-secondary/50 rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-primary/50',
          'placeholder:text-secondary-foreground',
          withLockIcon ? 'pl-10' : 'pl-4',
          'pr-11',
          className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
