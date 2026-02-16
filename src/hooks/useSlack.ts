import { useState, useCallback } from 'react';
import { sendFeedbackToSlack } from '../lib/slack';

interface FeedbackData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
}

export function useSlack() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendFeedback = useCallback(async (data: FeedbackData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Ensure data is serializable before sending
      const serializedData = {
        name: String(data.name),
        email: String(data.email),
        subject: String(data.subject),
        message: String(data.message),
        category: String(data.category)
      };

      const result = await sendFeedbackToSlack(serializedData);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send feedback');
      }
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send feedback';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    sendFeedback,
    isLoading,
    error
  };
}