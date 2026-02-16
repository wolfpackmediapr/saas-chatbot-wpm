import axios from 'axios';

interface FeedbackData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
}

export async function sendFeedbackToSlack(feedback: FeedbackData): Promise<{ success: boolean; error?: string }> {
  try {
    // Sanitize and serialize the feedback data
    const sanitizedFeedback = {
      name: String(feedback.name).trim(),
      email: String(feedback.email).trim(),
      subject: String(feedback.subject).trim(),
      message: String(feedback.message).trim(),
      category: String(feedback.category).trim()
    };

    const response = await axios.post(
      'https://slack.com/api/chat.postMessage',
      {
        channel: '#ai',
        text: 'New Feedback Received',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📬 New Feedback Received',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*From:*\n${sanitizedFeedback.name}`
              },
              {
                type: 'mrkdwn',
                text: `*Email:*\n${sanitizedFeedback.email}`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Category:*\n${sanitizedFeedback.category}`
              },
              {
                type: 'mrkdwn',
                text: `*Subject:*\n${sanitizedFeedback.subject}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:*\n${sanitizedFeedback.message}`
            }
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer xoxb-2980853661024-8143121765058-G99qat6WneCVMkWfKwmqifxq`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to send message to Slack');
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending feedback to Slack:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send feedback'
    };
  }
}