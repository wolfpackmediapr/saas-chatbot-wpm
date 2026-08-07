import React from 'react';

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: 'https://wolfpackmediapr.com/privacy-policy' },
  { label: 'Terms of Service', href: 'https://wolfpackmediapr.com/terms-of-service' },
  { label: 'Data Deletion Instructions', href: 'https://wolfpackmediapr.com/data-deletion' },
];

interface LegalFooterProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export default function LegalFooter({ variant = 'default', className = '' }: LegalFooterProps) {
  const isCompact = variant === 'compact';

  return (
    <footer className={className}>
      <div className={isCompact ? 'space-y-1' : 'space-y-3'}>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs md:text-sm">
          {LEGAL_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary-foreground hover:text-primary underline underline-offset-4 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="text-xs md:text-sm text-secondary-foreground">
          © {new Date().getFullYear()} WolfPack Media LLC. All rights reserved.
        </div>
        <div className="text-xs md:text-sm text-secondary-foreground">
          Designed and developed by WolfPack Media LLC
        </div>
      </div>
    </footer>
  );
}
