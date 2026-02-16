import React from 'react';
import { ExternalLink } from 'lucide-react';

interface Link {
  text: string;
  href: string;
}

interface HelpSectionProps {
  title: string;
  description: string;
  links: Link[];
}

export default function HelpSection({ title, description, links }: HelpSectionProps) {
  return (
    <div className="bg-secondary/50 rounded-lg p-6 h-full">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-secondary-foreground mb-4">{description}</p>
      <div className="space-y-2">
        {links.map((link) => (
          <a
            key={link.text}
            href={link.href}
            className="flex items-center gap-2 text-primary hover:text-primary-hover transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {link.text}
          </a>
        ))}
      </div>
    </div>
  );
}