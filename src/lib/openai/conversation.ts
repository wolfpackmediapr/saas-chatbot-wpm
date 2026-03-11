import { getOpenAIClientForBot } from './client';
import { handleToolCalls } from './functions';

export async function startConversation(apiKey?: string | null) {
  try {
    const client = await getOpenAIClientForBot(apiKey);

    if (!client) {
      throw new Error('OpenAI client not initialized');
    }

    const thread = await client.beta.threads.create();
    return thread.id;
  } catch (error) {
    console.error('Error starting conversation:', error);
    throw new Error('Failed to start conversation. Please check your API configuration.');
  }
}

export async function sendMessage(
  threadId: string,
  content: string,
  assistantId: string,
  apiKey?: string | null,
  files?: File[]
) {
  try {
    const client = await getOpenAIClientForBot(apiKey);

    if (!client) {
      throw new Error('OpenAI client not initialized');
    }

    const messageContent: any[] = [];

    if (content.trim()) {
      messageContent.push({
        type: 'text',
        text: content
      });
    }

    if (files?.length) {
      for (const file of files) {
        try {
          const fileResponse = await client.files.create({
            file,
            purpose: 'assistants'
          });

          messageContent.push({
            type: 'image_file',
            image_file: { file_id: fileResponse.id }
          });
        } catch (error) {
          console.error('Failed to upload file:', error);
          throw new Error('Failed to upload file. Please try again.');
        }
      }
    }

    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: messageContent
    });

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'sendToHoneybook',
          description: 'Send lead information to Honeybook CRM system for client management',
          parameters: {
            type: 'object',
            properties: {
              full_name: {
                type: 'string',
                description: 'Full name of the client'
              },
              email: {
                type: 'string',
                description: 'Email address of the client'
              },
              phone: {
                type: 'string',
                description: 'Phone number'
              },
              event_type: {
                type: 'string',
                description: 'Type of event (Wedding, Birthday, Corporate, Vacation, etc.)'
              },
              event_date: {
                type: 'string',
                description: 'Project start date MM/DD/YY'
              },
              event_end_date: {
                type: 'string',
                description: 'Project end date MM/DD/YY'
              },
              guest_count: {
                type: 'string',
                description: 'Total number of guests'
              },
              kids_count: {
                type: 'string',
                description: 'Number of kids'
              },
              venue_location: {
                type: 'string',
                description: 'Venue details, address, villa name'
              },
              budget_range: {
                type: 'string',
                description: 'Budget range'
              },
              services_interested: {
                type: 'string',
                description: 'Services interested in (Breakfast, Lunch, Dinner)'
              },
              kitchen_facilities: {
                type: 'string',
                description: 'Available kitchen facilities'
              },
              dietary_restrictions: {
                type: 'string',
                description: 'Dietary restrictions or proteins not consumed'
              },
              food_allergies: {
                type: 'string',
                description: 'Food allergies'
              },
              schedule: {
                type: 'string',
                description: 'Day by day schedule with meal times'
              },
              waiter_service: {
                type: 'string',
                description: 'Whether waiter service is needed'
              },
              bartender_service: {
                type: 'string',
                description: 'Whether bartender service is needed and start time'
              },
              how_found_us: {
                type: 'string',
                description: 'How they found In House Chef'
              },
              additional_info: {
                type: 'string',
                description: 'Additional information or special requests'
              },
              contact_method: {
                type: 'string',
                description: 'Preferred contact method'
              }
            },
            required: ['full_name', 'email']
          }
        }
      }
    ];

    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      tools: tools,
      tool_choice: 'auto'
    });

    let response;
    while (true) {
      const runStatus = await client.beta.threads.runs.retrieve(threadId, run.id);

      console.log(`Run status: ${runStatus.status}`);

      if (runStatus.status === 'completed') {
        const messages = await client.beta.threads.messages.list(threadId);
        const content = messages.data[0].content[0];

        if (content.type === 'text') {
          response = content.text.value;
        } else {
          console.warn('Unexpected content type:', content.type);
          response = 'Response received but could not be displayed.';
        }
        break;
      } else if (runStatus.status === 'failed') {
        console.error('Run failed:', runStatus.last_error);
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      } else if (runStatus.status === 'cancelled' || runStatus.status === 'expired') {
        throw new Error(`Assistant run ${runStatus.status}`);
      } else if (runStatus.status === 'requires_action') {
        console.log('Run requires action - processing tool calls');
        if (runStatus.required_action?.type === 'submit_tool_outputs') {
          const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;

          console.log(`Processing ${toolCalls.length} tool call(s)`);

          const toolOutputs = await handleToolCalls(toolCalls);

          console.log('Submitting tool outputs back to OpenAI');

          await client.beta.threads.runs.submitToolOutputs(threadId, run.id, {
            tool_outputs: toolOutputs
          });

          console.log('Tool outputs submitted successfully');
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}