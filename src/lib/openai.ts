import OpenAI from 'openai';

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

    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    let response;
    while (true) {
      const runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      if (runStatus.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(threadId);
        response = messages.data[0].content[0].text.value;
        break;
      } else if (runStatus.status === 'failed') {
        throw new Error('Assistant run failed');
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