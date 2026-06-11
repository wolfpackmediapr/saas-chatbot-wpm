import OpenAI from 'openai';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// ── Edge-function proxy (chat) ────────────────────────────────────────────────

async function callOpenAIChatProxy(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL is not configured');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/openai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `openai-chat proxy error ${res.status}`);
  return data as Record<string, unknown>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startConversation(accessToken: string, botId?: string): Promise<string> {
  try {
    const result = await callOpenAIChatProxy(accessToken, { action: 'create_thread', botId });
    return result.threadId as string;
  } catch (error) {
    console.error('Error starting conversation:', error);
    throw new Error('Failed to start conversation. Please check your bot configuration in Settings.');
  }
}

export async function sendMessage(
  threadId: string,
  content: string,
  accessToken: string,
  botId?: string,
): Promise<string | undefined> {
  try {
    const result = await callOpenAIChatProxy(accessToken, {
      action: 'send_message',
      threadId,
      message: content,
      botId,
    });
    return result.reply as string;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// ── Audio transcription (browser-side, user's own Whisper key) ────────────────
// The API key stays in the user's own bot row (protected by RLS).
// This is the only remaining browser-side OpenAI call; chat is fully proxied above.

export async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<string> {
  try {
    if (!apiKey) throw new Error('API key is required');
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
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
