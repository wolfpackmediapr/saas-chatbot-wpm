import OpenAI from 'openai';
import { getUserSettings } from '../supabase/settings';

const REQUIRED_ENV_VARS = {
  VITE_OPENAI_API_KEY: 'OpenAI API key',
  VITE_OPENAI_ASSISTANT_ID: 'OpenAI Assistant ID'
};

function validateEnvironmentVariables() {
  const missingVars = Object.entries(REQUIRED_ENV_VARS)
    .filter(([key]) => !import.meta.env[key])
    .map(([_, name]) => name);

  if (missingVars.length > 0) {
    console.warn('Missing OpenAI configuration. Chat features will be disabled.');
    return false;
  }
  return true;
}

export function createOpenAIClient(apiKey?: string) {
  try {
    const key = apiKey || import.meta.env.VITE_OPENAI_API_KEY;

    if (!key) {
      console.warn('No OpenAI API key provided.');
      return null;
    }

    return new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true
    });
  } catch (error) {
    console.error('OpenAI client initialization failed:', error);
    return null;
  }
}

export async function getOpenAIClientForBot(botApiKey?: string | null) {
  if (botApiKey) {
    return createOpenAIClient(botApiKey);
  }

  try {
    const settings = await getUserSettings();
    if (settings?.openai_api_key) {
      return createOpenAIClient(settings.openai_api_key);
    }
  } catch (error) {
    console.error('Failed to get user settings:', error);
  }

  return createOpenAIClient();
}

export const openai = createOpenAIClient();