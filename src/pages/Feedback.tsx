import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useSlack } from '../hooks/useSlack';

const categories = [
  'General Feedback',
  'Bug Report',
  'Feature Request',
  'Technical Support',
  'Other'
];

export default function Feedback() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    category: 'General Feedback'
  });
  
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const { sendFeedback, isLoading, error } = useSlack();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    
    try {
      const result = await sendFeedback(formData);
      if (result.success) {
        setStatus('success');
        setFormData({
          name: '',
          email: '',
          subject: '',
          message: '',
          category: 'General Feedback'
        });
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 md:mb-12"
        >
          <h1 className="text-2xl md:text-4xl font-bold mb-3 md:mb-4">Send Feedback</h1>
          <p className="text-sm md:text-xl text-secondary-foreground px-2">
            We value your feedback and are committed to improving your experience
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="bg-secondary/50 rounded-lg p-4 md:p-8"
        >
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
                />
              </div>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium mb-2">
                Category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium mb-2">
                Subject
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium mb-2">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className="w-full bg-secondary rounded-lg px-4 py-2.5 md:py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base resize-none"
              />
            </div>

            {status === 'error' && (
              <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-3 md:p-4 rounded-lg text-xs md:text-sm">
                <XCircle className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span>{error || 'Failed to send feedback'}</span>
              </div>
            )}

            {status === 'success' && (
              <div className="flex items-center gap-2 text-green-500 bg-green-500/10 p-3 md:p-4 rounded-lg text-xs md:text-sm">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span>Feedback sent successfully! Thank you for your input.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50 text-white rounded-lg px-4 py-3 md:py-2 flex items-center justify-center gap-2 transition-colors touch-manipulation text-sm md:text-base"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Feedback
                </>
              )}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  );
}