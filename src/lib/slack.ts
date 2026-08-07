import { supabase } from './supabase/client';

interface FeedbackData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
}

export async function sendFeedbackToSlack(feedback: FeedbackData): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase is not configured' };
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return { success: false, error: 'You must be signed in to send feedback' };
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: String(feedback.name).trim(),
        email: String(feedback.email).trim(),
        subject: String(feedback.subject).trim(),
        message: String(feedback.message).trim(),
        category: String(feedback.category).trim(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to send feedback' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending feedback:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send feedback',
    };
  }
}
