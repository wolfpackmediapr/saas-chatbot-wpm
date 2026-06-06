/*
  # WPM Bridge Schema Foundation

  Production target:
  - Supabase project: sb1-gbfmr9wd
  - Project ref: upthfjkxbsqtipzoeecd

  Purpose:
  - Add the productized WolfPack AI DM Agent / WPM Bridge data model.
  - Keep existing prototype tables intact.
  - Support Woztell channel routing, client/bot setup, conversations,
    leads, integrations, webhook logs, tool execution logs, and handoffs.

  Notes:
  - Tables use the `wpm_` prefix to avoid colliding with any existing
    generic tables such as `clients`, `messages`, or `integrations`.
  - AI provider keys and webhook URLs must remain server-side. This schema
    stores only integration metadata and encrypted/secret references.
  - RLS is enabled on every table. Authenticated dashboard users can manage
    records they own through `wpm_clients.owner_user_id`. Service role bypasses
    RLS for Edge Functions / backend bridge execution.
*/

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wpm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Clients
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text UNIQUE,
  industry text,
  website_url text,
  contact_name text,
  contact_email text,
  contact_phone text,
  timezone text DEFAULT 'America/Puerto_Rico',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'setup', 'active', 'paused', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_clients_owner_user_id ON public.wpm_clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_wpm_clients_status ON public.wpm_clients(status);
CREATE INDEX IF NOT EXISTS idx_wpm_clients_slug ON public.wpm_clients(slug);

DROP TRIGGER IF EXISTS trg_wpm_clients_updated_at ON public.wpm_clients;
CREATE TRIGGER trg_wpm_clients_updated_at
  BEFORE UPDATE ON public.wpm_clients
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can view owned clients" ON public.wpm_clients;
CREATE POLICY "WPM users can view owned clients"
  ON public.wpm_clients
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "WPM users can insert owned clients" ON public.wpm_clients;
CREATE POLICY "WPM users can insert owned clients"
  ON public.wpm_clients
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "WPM users can update owned clients" ON public.wpm_clients;
CREATE POLICY "WPM users can update owned clients"
  ON public.wpm_clients
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "WPM users can delete owned clients" ON public.wpm_clients;
CREATE POLICY "WPM users can delete owned clients"
  ON public.wpm_clients
  FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Client channels: Woztell / Instagram / Facebook / WhatsApp routing
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_client_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('instagram', 'facebook', 'whatsapp', 'web_chat', 'test')),
  provider text NOT NULL DEFAULT 'woztell',
  provider_channel_id text,
  provider_bot_id text,
  external_page_id text,
  external_phone_number text,
  display_name text,
  verification_token_hash text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wpm_client_channels_unique_provider_channel UNIQUE (provider, provider_channel_id, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_client_id ON public.wpm_client_channels(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_provider_channel_id ON public.wpm_client_channels(provider_channel_id);
CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_external_page_id ON public.wpm_client_channels(external_page_id);
CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_external_phone ON public.wpm_client_channels(external_phone_number);
CREATE INDEX IF NOT EXISTS idx_wpm_client_channels_active ON public.wpm_client_channels(is_active);

DROP TRIGGER IF EXISTS trg_wpm_client_channels_updated_at ON public.wpm_client_channels;
CREATE TRIGGER trg_wpm_client_channels_updated_at
  BEFORE UPDATE ON public.wpm_client_channels
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_client_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned client channels" ON public.wpm_client_channels;
CREATE POLICY "WPM users can manage owned client channels"
  ON public.wpm_client_channels
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_client_channels.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_client_channels.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Bot profiles and instructions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_bot_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  public_name text,
  template_key text,
  model_provider text NOT NULL DEFAULT 'openai',
  model_name text NOT NULL DEFAULT 'gpt-4.1-mini',
  tone text NOT NULL DEFAULT 'professional',
  language text NOT NULL DEFAULT 'en',
  response_length text NOT NULL DEFAULT 'balanced' CHECK (response_length IN ('concise', 'balanced', 'detailed')),
  booking_url text,
  handoff_contact text,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_bot_profiles_client_id ON public.wpm_bot_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_bot_profiles_active ON public.wpm_bot_profiles(client_id, is_active);

DROP TRIGGER IF EXISTS trg_wpm_bot_profiles_updated_at ON public.wpm_bot_profiles;
CREATE TRIGGER trg_wpm_bot_profiles_updated_at
  BEFORE UPDATE ON public.wpm_bot_profiles
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_bot_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned bot profiles" ON public.wpm_bot_profiles;
CREATE POLICY "WPM users can manage owned bot profiles"
  ON public.wpm_bot_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_bot_profiles.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_bot_profiles.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.wpm_bot_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_profile_id uuid NOT NULL REFERENCES public.wpm_bot_profiles(id) ON DELETE CASCADE,
  system_prompt text NOT NULL DEFAULT '',
  business_summary text,
  faq_instructions text,
  lead_qualification_instructions text,
  handoff_rules text,
  never_say_rules text,
  emergency_keywords text[] NOT NULL DEFAULT '{}'::text[],
  lead_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_bot_instructions_profile_id ON public.wpm_bot_instructions(bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_wpm_bot_instructions_active ON public.wpm_bot_instructions(bot_profile_id, is_active);

DROP TRIGGER IF EXISTS trg_wpm_bot_instructions_updated_at ON public.wpm_bot_instructions;
CREATE TRIGGER trg_wpm_bot_instructions_updated_at
  BEFORE UPDATE ON public.wpm_bot_instructions
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_bot_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned bot instructions" ON public.wpm_bot_instructions;
CREATE POLICY "WPM users can manage owned bot instructions"
  ON public.wpm_bot_instructions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wpm_bot_profiles bp
      JOIN public.wpm_clients c ON c.id = bp.client_id
      WHERE bp.id = wpm_bot_instructions.bot_profile_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.wpm_bot_profiles bp
      JOIN public.wpm_clients c ON c.id = bp.client_id
      WHERE bp.id = wpm_bot_instructions.bot_profile_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Knowledge sources
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  bot_profile_id uuid REFERENCES public.wpm_bot_profiles(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('manual', 'file', 'url', 'faq', 'notion', 'google_doc')),
  title text NOT NULL,
  source_url text,
  storage_path text,
  content_text text,
  external_vector_store_id text,
  external_file_id text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'failed', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_knowledge_sources_client_id ON public.wpm_knowledge_sources(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_knowledge_sources_bot_profile_id ON public.wpm_knowledge_sources(bot_profile_id);
CREATE INDEX IF NOT EXISTS idx_wpm_knowledge_sources_status ON public.wpm_knowledge_sources(status);

DROP TRIGGER IF EXISTS trg_wpm_knowledge_sources_updated_at ON public.wpm_knowledge_sources;
CREATE TRIGGER trg_wpm_knowledge_sources_updated_at
  BEFORE UPDATE ON public.wpm_knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_knowledge_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned knowledge sources" ON public.wpm_knowledge_sources;
CREATE POLICY "WPM users can manage owned knowledge sources"
  ON public.wpm_knowledge_sources
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_knowledge_sources.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_knowledge_sources.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Conversations and messages
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.wpm_client_channels(id) ON DELETE SET NULL,
  bot_profile_id uuid REFERENCES public.wpm_bot_profiles(id) ON DELETE SET NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('instagram', 'facebook', 'whatsapp', 'web_chat', 'test')),
  external_conversation_id text,
  external_user_id text,
  external_user_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handoff', 'closed', 'archived')),
  last_message_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wpm_conversations_unique_external UNIQUE (client_id, channel_type, external_conversation_id, external_user_id)
);

CREATE INDEX IF NOT EXISTS idx_wpm_conversations_client_id ON public.wpm_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_conversations_channel_id ON public.wpm_conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_wpm_conversations_external_user ON public.wpm_conversations(external_user_id);
CREATE INDEX IF NOT EXISTS idx_wpm_conversations_status ON public.wpm_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wpm_conversations_last_message_at ON public.wpm_conversations(last_message_at DESC);

DROP TRIGGER IF EXISTS trg_wpm_conversations_updated_at ON public.wpm_conversations;
CREATE TRIGGER trg_wpm_conversations_updated_at
  BEFORE UPDATE ON public.wpm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned conversations" ON public.wpm_conversations;
CREATE POLICY "WPM users can manage owned conversations"
  ON public.wpm_conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_conversations.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_conversations.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.wpm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wpm_conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool', 'human')),
  content text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb,
  provider_message_id text,
  model_provider text,
  model_name text,
  token_usage jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_messages_conversation_id ON public.wpm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wpm_messages_client_id ON public.wpm_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_messages_created_at ON public.wpm_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_wpm_messages_direction ON public.wpm_messages(direction);

ALTER TABLE public.wpm_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned messages" ON public.wpm_messages;
CREATE POLICY "WPM users can manage owned messages"
  ON public.wpm_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_messages.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_messages.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wpm_conversations(id) ON DELETE SET NULL,
  full_name text,
  email text,
  phone text,
  service_interest text,
  intent text,
  qualification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_channel text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'sent_to_crm', 'handoff', 'closed', 'lost')),
  assigned_to text,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_leads_client_id ON public.wpm_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_leads_conversation_id ON public.wpm_leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wpm_leads_status ON public.wpm_leads(status);
CREATE INDEX IF NOT EXISTS idx_wpm_leads_email ON public.wpm_leads(email);
CREATE INDEX IF NOT EXISTS idx_wpm_leads_phone ON public.wpm_leads(phone);

DROP TRIGGER IF EXISTS trg_wpm_leads_updated_at ON public.wpm_leads;
CREATE TRIGGER trg_wpm_leads_updated_at
  BEFORE UPDATE ON public.wpm_leads
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned leads" ON public.wpm_leads;
CREATE POLICY "WPM users can manage owned leads"
  ON public.wpm_leads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_leads.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_leads.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Integrations and server-side tool execution
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  provider text NOT NULL,
  integration_type text NOT NULL CHECK (integration_type IN ('zapier_webhook', 'crm', 'calendar', 'email', 'slack', 'custom_webhook')),
  name text NOT NULL,
  secret_reference text,
  webhook_url_encrypted text,
  field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_integrations_client_id ON public.wpm_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_integrations_provider ON public.wpm_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_wpm_integrations_active ON public.wpm_integrations(is_active);

DROP TRIGGER IF EXISTS trg_wpm_integrations_updated_at ON public.wpm_integrations;
CREATE TRIGGER trg_wpm_integrations_updated_at
  BEFORE UPDATE ON public.wpm_integrations
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned integrations" ON public.wpm_integrations;
CREATE POLICY "WPM users can manage owned integrations"
  ON public.wpm_integrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_integrations.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_integrations.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.wpm_tool_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.wpm_conversations(id) ON DELETE SET NULL,
  integration_id uuid REFERENCES public.wpm_integrations(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  error_message text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_tool_executions_client_id ON public.wpm_tool_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_tool_executions_conversation_id ON public.wpm_tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wpm_tool_executions_status ON public.wpm_tool_executions(status);
CREATE INDEX IF NOT EXISTS idx_wpm_tool_executions_tool_name ON public.wpm_tool_executions(tool_name);

ALTER TABLE public.wpm_tool_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can view owned tool executions" ON public.wpm_tool_executions;
CREATE POLICY "WPM users can view owned tool executions"
  ON public.wpm_tool_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_tool_executions.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Webhook events and handoffs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wpm_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.wpm_clients(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.wpm_client_channels(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.wpm_conversations(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'woztell',
  event_type text,
  external_event_id text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload jsonb,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored', 'unmatched_channel')),
  response_payload jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_client_id ON public.wpm_webhook_events(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_channel_id ON public.wpm_webhook_events(channel_id);
CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_conversation_id ON public.wpm_webhook_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_status ON public.wpm_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_created_at ON public.wpm_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpm_webhook_events_external_event_id ON public.wpm_webhook_events(external_event_id);

ALTER TABLE public.wpm_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can view owned webhook events" ON public.wpm_webhook_events;
CREATE POLICY "WPM users can view owned webhook events"
  ON public.wpm_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    client_id IS NULL OR EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_webhook_events.client_id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.wpm_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.wpm_clients(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wpm_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.wpm_leads(id) ON DELETE SET NULL,
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpm_handoff_events_client_id ON public.wpm_handoff_events(client_id);
CREATE INDEX IF NOT EXISTS idx_wpm_handoff_events_conversation_id ON public.wpm_handoff_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wpm_handoff_events_status ON public.wpm_handoff_events(status);
CREATE INDEX IF NOT EXISTS idx_wpm_handoff_events_priority ON public.wpm_handoff_events(priority);

DROP TRIGGER IF EXISTS trg_wpm_handoff_events_updated_at ON public.wpm_handoff_events;
CREATE TRIGGER trg_wpm_handoff_events_updated_at
  BEFORE UPDATE ON public.wpm_handoff_events
  FOR EACH ROW EXECUTE FUNCTION public.wpm_set_updated_at();

ALTER TABLE public.wpm_handoff_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "WPM users can manage owned handoff events" ON public.wpm_handoff_events;
CREATE POLICY "WPM users can manage owned handoff events"
  ON public.wpm_handoff_events
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_handoff_events.client_id
        AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wpm_clients c
      WHERE c.id = wpm_handoff_events.client_id
        AND c.owner_user_id = auth.uid()
    )
  );
