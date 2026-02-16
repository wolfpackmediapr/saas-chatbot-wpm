import React from 'react';
import { MessageCircle, Mail, Ticket } from 'lucide-react';

export default function ContactSupport() {
  return (
    <div className="bg-secondary/50 rounded-lg p-8 mb-8">
      <h2 className="text-2xl font-bold mb-6">Contact Support</h2>
      <p className="text-secondary-foreground mb-6">
        Need assistance? The WolfPack Media AI support team is here to help.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <a
          href="#"
          className="flex items-center gap-3 p-4 bg-secondary rounded-lg hover:bg-secondary/70 transition-colors"
        >
          <MessageCircle className="w-5 h-5 text-primary" />
          <span>Start Live Chat</span>
        </a>
        <a
          href="mailto:support@wolfpackmediaai.com"
          className="flex items-center gap-3 p-4 bg-secondary rounded-lg hover:bg-secondary/70 transition-colors"
        >
          <Mail className="w-5 h-5 text-primary" />
          <span>Email Support</span>
        </a>
        <a
          href="#"
          className="flex items-center gap-3 p-4 bg-secondary rounded-lg hover:bg-secondary/70 transition-colors"
        >
          <Ticket className="w-5 h-5 text-primary" />
          <span>Submit Ticket</span>
        </a>
      </div>
    </div>
  );
}