// Type-safe environment variables
interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OPENAI_ASSISTANT_ID: string;
  readonly VITE_ZAPIER_SEND_TO_HONEYBOOK_WEBHOOK?: string;
  readonly VITE_ZAPIER_QUALIFY_LEAD_WEBHOOK?: string;
  readonly VITE_ZAPIER_SCHEDULE_CONSULTATION_WEBHOOK?: string;
  readonly VITE_ZAPIER_CREATE_INVOICE_WEBHOOK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export function getEnvVar(key: keyof ImportMetaEnv, required = true): string {
  const value = import.meta.env[key];
  if (!value && required) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value || '';
}

export function validateEnv() {
  return {
    OPENAI_API_KEY: getEnvVar('VITE_OPENAI_API_KEY'),
    OPENAI_ASSISTANT_ID: getEnvVar('VITE_OPENAI_ASSISTANT_ID'),
  };
}

export function getZapierWebhookUrl(functionName: string): string | null {
  const webhookMap: Record<string, keyof ImportMetaEnv> = {
    'send_to_honeybook': 'VITE_ZAPIER_SEND_TO_HONEYBOOK_WEBHOOK',
    'qualify_lead': 'VITE_ZAPIER_QUALIFY_LEAD_WEBHOOK',
    'schedule_consultation': 'VITE_ZAPIER_SCHEDULE_CONSULTATION_WEBHOOK',
    'create_invoice': 'VITE_ZAPIER_CREATE_INVOICE_WEBHOOK',
  };

  const envKey = webhookMap[functionName];
  if (!envKey) {
    console.warn(`Function name "${functionName}" not found in webhook map`);
    return null;
  }

  return getEnvVar(envKey, false);
}