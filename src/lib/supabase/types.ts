export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ai_bots: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          assistant_id: string | null
          api_key: string | null
          is_active: boolean | null
          color: string | null
          icon: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          assistant_id?: string | null
          api_key?: string | null
          is_active?: boolean | null
          color?: string | null
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          assistant_id?: string | null
          api_key?: string | null
          is_active?: boolean | null
          color?: string | null
          icon?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      app_admins: {
        Row: {
          user_id: string
          granted_at: string
          granted_by: string | null
          notes: string | null
        }
        Insert: {
          user_id: string
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
        }
        Update: {
          user_id?: string
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
        }
      }
      chat_threads: {
        Row: {
          id: string
          user_id: string
          title: string
          openai_thread_id: string | null
          created_at: string | null
          updated_at: string | null
          bot_id: string | null
          bot_name: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          openai_thread_id?: string | null
          created_at?: string
          updated_at?: string
          bot_id?: string | null
          bot_name?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          openai_thread_id?: string | null
          created_at?: string
          updated_at?: string
          bot_id?: string | null
          bot_name?: string | null
        }
      }
      chat_messages: {
        Row: {
          id: string
          thread_id: string
          content: string
          is_user: boolean
          images: Json[] | null
          created_at: string | null
        }
        Insert: {
          id?: string
          thread_id: string
          content: string
          is_user?: boolean
          images?: Json[] | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          content?: string
          is_user?: boolean
          images?: Json[] | null
          created_at?: string
        }
      }
      user_settings: {
        Row: {
          user_id: string
          company_logo: string | null
          response_style: string | null
          response_length: string | null
          openai_api_key: string | null
          openai_assistant_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          company_logo?: string | null
          response_style?: string | null
          response_length?: string | null
          openai_api_key?: string | null
          openai_assistant_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          company_logo?: string | null
          response_style?: string | null
          response_length?: string | null
          openai_api_key?: string | null
          openai_assistant_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          details: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          details?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: string
          status: string
          current_period_end: string | null
          cancel_at_period_end: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          status?: string
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          status?: string
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      wpm_clients: {
        Row: {
          id: string
          owner_user_id: string | null
          name: string
          slug: string | null
          industry: string | null
          website_url: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          timezone: string | null
          status: string
          notes: string | null
          created_at: string
          updated_at: string
          description: string | null
          services: string | null
          location: string | null
        }
        Insert: {
          id?: string
          owner_user_id?: string | null
          name: string
          slug?: string | null
          industry?: string | null
          website_url?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          timezone?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          description?: string | null
          services?: string | null
          location?: string | null
        }
        Update: {
          id?: string
          owner_user_id?: string | null
          name?: string
          slug?: string | null
          industry?: string | null
          website_url?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          timezone?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          description?: string | null
          services?: string | null
          location?: string | null
        }
      }
      wpm_bot_profiles: {
        Row: {
          id: string
          client_id: string
          name: string
          public_name: string | null
          template_key: string | null
          model_provider: string
          model_name: string
          tone: string
          language: string
          response_length: string
          booking_url: string | null
          handoff_contact: string | null
          is_active: boolean
          settings: Json
          created_at: string
          updated_at: string
          owner_user_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          public_name?: string | null
          template_key?: string | null
          model_provider?: string
          model_name?: string
          tone?: string
          language?: string
          response_length?: string
          booking_url?: string | null
          handoff_contact?: string | null
          is_active?: boolean
          settings?: Json
          created_at?: string
          updated_at?: string
          owner_user_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          public_name?: string | null
          template_key?: string | null
          model_provider?: string
          model_name?: string
          tone?: string
          language?: string
          response_length?: string
          booking_url?: string | null
          handoff_contact?: string | null
          is_active?: boolean
          settings?: Json
          created_at?: string
          updated_at?: string
          owner_user_id?: string | null
        }
      }
      wpm_bot_instructions: {
        Row: {
          id: string
          bot_profile_id: string
          system_prompt: string
          business_summary: string | null
          faq_instructions: string | null
          lead_qualification_instructions: string | null
          handoff_rules: string | null
          never_say_rules: string | null
          emergency_keywords: string[]
          lead_fields: Json
          version: number
          is_active: boolean
          created_at: string
          updated_at: string
          owner_user_id: string | null
          primary_goal: string
          response_language: string
        }
        Insert: {
          id?: string
          bot_profile_id: string
          system_prompt?: string
          business_summary?: string | null
          faq_instructions?: string | null
          lead_qualification_instructions?: string | null
          handoff_rules?: string | null
          never_say_rules?: string | null
          emergency_keywords?: string[]
          lead_fields?: Json
          version?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          owner_user_id?: string | null
          primary_goal?: string
          response_language?: string
        }
        Update: {
          id?: string
          bot_profile_id?: string
          system_prompt?: string
          business_summary?: string | null
          faq_instructions?: string | null
          lead_qualification_instructions?: string | null
          handoff_rules?: string | null
          never_say_rules?: string | null
          emergency_keywords?: string[]
          lead_fields?: Json
          version?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          owner_user_id?: string | null
          primary_goal?: string
          response_language?: string
        }
      }
      wpm_client_channels: {
        Row: {
          id: string
          client_id: string
          channel_type: string
          provider: string
          provider_channel_id: string | null
          provider_bot_id: string | null
          external_page_id: string | null
          external_phone_number: string | null
          display_name: string | null
          verification_token_hash: string | null
          is_active: boolean
          metadata: Json
          created_at: string
          updated_at: string
          page_access_token: string | null
          bot_profile_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          channel_type: string
          provider?: string
          provider_channel_id?: string | null
          provider_bot_id?: string | null
          external_page_id?: string | null
          external_phone_number?: string | null
          display_name?: string | null
          verification_token_hash?: string | null
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          page_access_token?: string | null
          bot_profile_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          channel_type?: string
          provider?: string
          provider_channel_id?: string | null
          provider_bot_id?: string | null
          external_page_id?: string | null
          external_phone_number?: string | null
          display_name?: string | null
          verification_token_hash?: string | null
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          page_access_token?: string | null
          bot_profile_id?: string | null
        }
      }
      wpm_conversations: {
        Row: {
          id: string
          client_id: string
          channel_id: string | null
          bot_profile_id: string | null
          channel_type: string
          external_conversation_id: string | null
          external_user_id: string | null
          external_user_name: string | null
          status: string
          last_message_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          channel_id?: string | null
          bot_profile_id?: string | null
          channel_type: string
          external_conversation_id?: string | null
          external_user_id?: string | null
          external_user_name?: string | null
          status?: string
          last_message_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          channel_id?: string | null
          bot_profile_id?: string | null
          channel_type?: string
          external_conversation_id?: string | null
          external_user_id?: string | null
          external_user_name?: string | null
          status?: string
          last_message_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      wpm_messages: {
        Row: {
          id: string
          conversation_id: string
          client_id: string
          direction: string
          role: string
          content: string
          attachments: Json
          raw_payload: Json | null
          provider_message_id: string | null
          model_provider: string | null
          model_name: string | null
          token_usage: Json | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          client_id: string
          direction: string
          role: string
          content?: string
          attachments?: Json
          raw_payload?: Json | null
          provider_message_id?: string | null
          model_provider?: string | null
          model_name?: string | null
          token_usage?: Json | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          client_id?: string
          direction?: string
          role?: string
          content?: string
          attachments?: Json
          raw_payload?: Json | null
          provider_message_id?: string | null
          model_provider?: string | null
          model_name?: string | null
          token_usage?: Json | null
          metadata?: Json
          created_at?: string
        }
      }
      wpm_leads: {
        Row: {
          id: string
          client_id: string
          conversation_id: string | null
          full_name: string | null
          email: string | null
          phone: string | null
          service_interest: string | null
          intent: string | null
          qualification_data: Json
          source_channel: string | null
          status: string
          assigned_to: string | null
          last_contact_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          conversation_id?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          service_interest?: string | null
          intent?: string | null
          qualification_data?: Json
          source_channel?: string | null
          status?: string
          assigned_to?: string | null
          last_contact_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          conversation_id?: string | null
          full_name?: string | null
          email?: string | null
          phone?: string | null
          service_interest?: string | null
          intent?: string | null
          qualification_data?: Json
          source_channel?: string | null
          status?: string
          assigned_to?: string | null
          last_contact_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      wpm_handoff_events: {
        Row: {
          id: string
          client_id: string
          conversation_id: string
          lead_id: string | null
          reason: string
          priority: string
          assigned_to: string | null
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          conversation_id: string
          lead_id?: string | null
          reason: string
          priority?: string
          assigned_to?: string | null
          status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          conversation_id?: string
          lead_id?: string | null
          reason?: string
          priority?: string
          assigned_to?: string | null
          status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      wpm_integrations: {
        Row: {
          id: string
          client_id: string
          provider: string
          integration_type: string
          name: string
          secret_reference: string | null
          webhook_url_encrypted: string | null
          field_map: Json
          is_active: boolean
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          provider: string
          integration_type: string
          name: string
          secret_reference?: string | null
          webhook_url_encrypted?: string | null
          field_map?: Json
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          provider?: string
          integration_type?: string
          name?: string
          secret_reference?: string | null
          webhook_url_encrypted?: string | null
          field_map?: Json
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      wpm_knowledge_sources: {
        Row: {
          id: string
          client_id: string
          bot_profile_id: string | null
          source_type: string
          title: string
          source_url: string | null
          storage_path: string | null
          content_text: string | null
          external_vector_store_id: string | null
          external_file_id: string | null
          status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          bot_profile_id?: string | null
          source_type: string
          title: string
          source_url?: string | null
          storage_path?: string | null
          content_text?: string | null
          external_vector_store_id?: string | null
          external_file_id?: string | null
          status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          bot_profile_id?: string | null
          source_type?: string
          title?: string
          source_url?: string | null
          storage_path?: string | null
          content_text?: string | null
          external_vector_store_id?: string | null
          external_file_id?: string | null
          status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      wpm_tool_executions: {
        Row: {
          id: string
          client_id: string
          conversation_id: string | null
          integration_id: string | null
          tool_name: string
          input_payload: Json
          output_payload: Json | null
          status: string
          error_message: string | null
          latency_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          conversation_id?: string | null
          integration_id?: string | null
          tool_name: string
          input_payload?: Json
          output_payload?: Json | null
          status?: string
          error_message?: string | null
          latency_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          conversation_id?: string | null
          integration_id?: string | null
          tool_name?: string
          input_payload?: Json
          output_payload?: Json | null
          status?: string
          error_message?: string | null
          latency_ms?: number | null
          created_at?: string
        }
      }
      wpm_webhook_events: {
        Row: {
          id: string
          client_id: string | null
          channel_id: string | null
          conversation_id: string | null
          provider: string
          event_type: string | null
          external_event_id: string | null
          raw_payload: Json
          normalized_payload: Json | null
          status: string
          response_payload: Json | null
          error_message: string | null
          processed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          channel_id?: string | null
          conversation_id?: string | null
          provider?: string
          event_type?: string | null
          external_event_id?: string | null
          raw_payload?: Json
          normalized_payload?: Json | null
          status?: string
          response_payload?: Json | null
          error_message?: string | null
          processed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          channel_id?: string | null
          conversation_id?: string | null
          provider?: string
          event_type?: string | null
          external_event_id?: string | null
          raw_payload?: Json
          normalized_payload?: Json | null
          status?: string
          response_payload?: Json | null
          error_message?: string | null
          processed_at?: string | null
          created_at?: string
        }
      }
    }
  }
}
