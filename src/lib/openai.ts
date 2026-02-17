import OpenAI from 'openai';
import { getZapierWebhookUrl } from './config/env';

function createOpenAIClient(apiKey: string) {
  try {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    return new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });
  } catch (error) {
    console.error('OpenAI client initialization failed:', error);
    throw error;
  }
}

export async function startConversation(apiKey: string) {
  try {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const openai = createOpenAIClient(apiKey);
    const thread = await openai.beta.threads.create();
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
  apiKey: string,
  images?: File[]
) {
  try {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (!assistantId) {
      throw new Error('Assistant ID is required');
    }

    const openai = createOpenAIClient(apiKey);

    const messages = [];

    if (images?.length) {
      for (const image of images) {
        const fileResponse = await openai.files.create({
          file: image,
          purpose: 'assistants',
        });
        messages.push({
          role: 'user' as const,
          content: '',
          file_ids: [fileResponse.id],
        });
      }
    }

    messages.push({
      role: 'user' as const,
      content: content,
    });

    await openai.beta.threads.messages.create(threadId, messages[0]);

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

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      tools: tools,
      tool_choice: 'auto'
    });

    let response;
    while (true) {
      const runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);

      console.log(`Run status: ${runStatus.status}`);

      if (runStatus.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(threadId);
        const content = messages.data[0].content[0];
        if (content.type === 'text') {
          response = content.text.value;
        } else {
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

          console.log(`[Tool Calls] Processing ${toolCalls.length} tool call(s)`);

          const toolOutputs = [];

          for (const toolCall of toolCalls) {
            console.log(`[Tool Calls] Function name: ${toolCall.function.name}`);
            console.log(`[Tool Calls] Function arguments:`, toolCall.function.arguments);

            try {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);

              const webhookUrl = getZapierWebhookUrl(functionName);

              if (!webhookUrl) {
                console.warn(`[Function Call] ⚠️ No webhook URL configured for ${functionName}`);
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    error: `Webhook not configured for ${functionName}`
                  })
                });
                continue;
              }

              console.log(`[Function Call] Webhook URL found: ${webhookUrl}`);
              console.log(`[Function Call] Sending data to webhook:`, functionArgs);

              const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(functionArgs),
              });

              if (!response.ok) {
                throw new Error(`Webhook request failed: ${response.statusText}`);
              }

              const responseData = await response.json();
              console.log(`[Function Call] ✅ Webhook response:`, responseData);

              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  success: true,
                  message: `Successfully processed ${functionName}`,
                  data: responseData
                })
              });

            } catch (error) {
              console.error(`[Function Call] ❌ Error executing ${toolCall.function.name}:`, error);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error'
                })
              });
            }
          }

          console.log('[Tool Calls] Submitting tool outputs back to OpenAI');

          await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
            tool_outputs: toolOutputs
          });

          console.log('[Tool Calls] ✅ Tool outputs submitted successfully');
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

export async function transcribeAudio(audioBlob: Blob, apiKey: string) {
  try {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const openai = createOpenAIClient(apiKey);
    const response = await openai.audio.transcriptions.create({
      file: audioBlob,
      model: 'whisper-1',
    });
    return response.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error('Failed to transcribe audio. Please check your API configuration.');
  }
}