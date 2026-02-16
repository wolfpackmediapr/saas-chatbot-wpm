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
                description: 'Full name of the lead'
              },
              email: {
                type: 'string',
                description: 'Email address of the lead'
              },
              phone: {
                type: 'string',
                description: 'Phone number of the lead'
              },
              message: {
                type: 'string',
                description: 'Message or details about the lead inquiry'
              }
            },
            required: ['full_name', 'email', 'phone', 'message']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'qualifyLead',
          description: 'Qualify a lead based on their responses and project requirements',
          parameters: {
            type: 'object',
            properties: {
              leadScore: {
                type: 'number',
                description: 'Score from 1-10 indicating lead quality'
              },
              qualificationNotes: {
                type: 'string',
                description: 'Notes about why the lead was qualified or not'
              },
              readyToConvert: {
                type: 'boolean',
                description: 'Whether the lead is ready to become a client'
              }
            },
            required: ['leadScore', 'readyToConvert']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'scheduleConsultation',
          description: 'Schedule a consultation call or meeting with the lead',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the person scheduling'
              },
              email: {
                type: 'string',
                description: 'Email address for calendar invite'
              },
              preferredDate: {
                type: 'string',
                description: 'Preferred date for consultation'
              },
              preferredTime: {
                type: 'string',
                description: 'Preferred time for consultation'
              },
              consultationType: {
                type: 'string',
                description: 'Type of consultation (phone, video, in-person)'
              }
            },
            required: ['name', 'email']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'createInvoice',
          description: 'Create an invoice for services or products',
          parameters: {
            type: 'object',
            properties: {
              clientName: {
                type: 'string',
                description: 'Name of the client'
              },
              clientEmail: {
                type: 'string',
                description: 'Email address of the client'
              },
              amount: {
                type: 'number',
                description: 'Invoice amount in dollars'
              },
              description: {
                type: 'string',
                description: 'Description of services or products'
              },
              dueDate: {
                type: 'string',
                description: 'Due date for the invoice'
              }
            },
            required: ['clientName', 'clientEmail', 'amount', 'description']
          }
        }
      }
    ];

    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      tools: tools
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