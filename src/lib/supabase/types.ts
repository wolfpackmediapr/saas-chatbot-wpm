export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_bots: {
        Row: {
          api_key: string | null
          assistant_id: string | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key?: string | null
          assistant_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string | null
          assistant_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          images: Json | null
          is_user: boolean
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          images?: Json | null
          is_user?: boolean
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          images?: Json | null
          is_user?: boolean
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          bot_id: string | null
          bot_name: string | null
          created_at: string | null
          id: string
          openai_thread_id: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          bot_name?: string | null
          created_at?: string | null
          id?: string
          openai_thread_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bot_id?: string | null
          bot_name?: string | null
          created_at?: string | null
          id?: string
          openai_thread_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "ai_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          company_logo: string | null
          created_at: string | null
          inbox_last_seen_at: string | null
          leads_last_seen_at: string | null
          openai_api_key: string | null
          openai_assistant_id: string | null
          response_length: string | null
          response_style: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_logo?: string | null
          created_at?: string | null
          inbox_last_seen_at?: string | null
          leads_last_seen_at?: string | null
          openai_api_key?: string | null
          openai_assistant_id?: string | null
          response_length?: string | null
          response_style?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_logo?: string | null
          created_at?: string | null
          inbox_last_seen_at?: string | null
          leads_last_seen_at?: string | null
          openai_api_key?: string | null
          openai_assistant_id?: string | null
          response_length?: string | null
          response_style?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wpm_bot_instructions: {
        Row: {
          bot_profile_id: string
          business_summary: string | null
          created_at: string
          emergency_keywords: string[]
          faq_instructions: string | null
          handoff_rules: string | null
          id: string
          is_active: boolean
          lead_fields: Json
          lead_qualification_instructions: string | null
          never_say_rules: string | null
          owner_user_id: string | null
          primary_goal: string
          response_language: string
          system_prompt: string
          updated_at: string
          version: number
        }
        Insert: {
          bot_profile_id: string
          business_summary?: string | null
          created_at?: string
          emergency_keywords?: string[]
          faq_instructions?: string | null
          handoff_rules?: string | null
          id?: string
          is_active?: boolean
          lead_fields?: Json
          lead_qualification_instructions?: string | null
          never_say_rules?: string | null
          owner_user_id?: string | null
          primary_goal?: string
          response_language?: string
          system_prompt?: string
          updated_at?: string
          version?: number
        }
        Update: {
          bot_profile_id?: string
          business_summary?: string | null
          created_at?: string
          emergency_keywords?: string[]
          faq_instructions?: string | null
          handoff_rules?: string | null
          id?: string
          is_active?: boolean
          lead_fields?: Json
          lead_qualification_instructions?: string | null
          never_say_rules?: string | null
          owner_user_id?: string | null
          primary_goal?: string
          response_language?: string
          system_prompt?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wpm_bot_instructions_bot_profile_id_fkey"
            columns: ["bot_profile_id"]
            isOneToOne: false
            referencedRelation: "wpm_bot_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_bot_profiles: {
        Row: {
          booking_url: string | null
          client_id: string
          created_at: string
          handoff_contact: string | null
          id: string
          is_active: boolean
          language: string
          model_name: string
          model_provider: string
          name: string
          owner_user_id: string | null
          public_name: string | null
          response_length: string
          settings: Json
          template_key: string | null
          tone: string
          updated_at: string
        }
        Insert: {
          booking_url?: string | null
          client_id: string
          created_at?: string
          handoff_contact?: string | null
          id?: string
          is_active?: boolean
          language?: string
          model_name?: string
          model_provider?: string
          name: string
          owner_user_id?: string | null
          public_name?: string | null
          response_length?: string
          settings?: Json
          template_key?: string | null
          tone?: string
          updated_at?: string
        }
        Update: {
          booking_url?: string | null
          client_id?: string
          created_at?: string
          handoff_contact?: string | null
          id?: string
          is_active?: boolean
          language?: string
          model_name?: string
          model_provider?: string
          name?: string
          owner_user_id?: string | null
          public_name?: string | null
          response_length?: string
          settings?: Json
          template_key?: string | null
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_bot_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_client_channels: {
        Row: {
          bot_profile_id: string | null
          channel_type: string
          client_id: string
          created_at: string
          display_name: string | null
          external_page_id: string | null
          external_phone_number: string | null
          id: string
          is_active: boolean
          metadata: Json
          page_access_token: string | null
          provider: string
          provider_bot_id: string | null
          provider_channel_id: string | null
          updated_at: string
          verification_token_hash: string | null
        }
        Insert: {
          bot_profile_id?: string | null
          channel_type: string
          client_id: string
          created_at?: string
          display_name?: string | null
          external_page_id?: string | null
          external_phone_number?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          page_access_token?: string | null
          provider?: string
          provider_bot_id?: string | null
          provider_channel_id?: string | null
          updated_at?: string
          verification_token_hash?: string | null
        }
        Update: {
          bot_profile_id?: string | null
          channel_type?: string
          client_id?: string
          created_at?: string
          display_name?: string | null
          external_page_id?: string | null
          external_phone_number?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          page_access_token?: string | null
          provider?: string
          provider_bot_id?: string | null
          provider_channel_id?: string | null
          updated_at?: string
          verification_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wpm_client_channels_bot_profile_id_fkey"
            columns: ["bot_profile_id"]
            isOneToOne: false
            referencedRelation: "wpm_bot_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_client_channels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          industry: string | null
          location: string | null
          name: string
          notes: string | null
          owner_user_id: string | null
          services: string | null
          slug: string | null
          status: string
          timezone: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          name: string
          notes?: string | null
          owner_user_id?: string | null
          services?: string | null
          slug?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          owner_user_id?: string | null
          services?: string | null
          slug?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      wpm_conversations: {
        Row: {
          bot_profile_id: string | null
          channel_id: string | null
          channel_type: string
          client_id: string
          created_at: string
          external_conversation_id: string | null
          external_user_id: string | null
          external_user_name: string | null
          id: string
          last_message_at: string | null
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          bot_profile_id?: string | null
          channel_id?: string | null
          channel_type: string
          client_id: string
          created_at?: string
          external_conversation_id?: string | null
          external_user_id?: string | null
          external_user_name?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          bot_profile_id?: string | null
          channel_id?: string | null
          channel_type?: string
          client_id?: string
          created_at?: string
          external_conversation_id?: string | null
          external_user_id?: string | null
          external_user_name?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_conversations_bot_profile_id_fkey"
            columns: ["bot_profile_id"]
            isOneToOne: false
            referencedRelation: "wpm_bot_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "wpm_client_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_handoff_events: {
        Row: {
          assigned_to: string | null
          client_id: string
          conversation_id: string
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json
          priority: string
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          conversation_id: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          priority?: string
          reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          priority?: string
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_handoff_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_handoff_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wpm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_handoff_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "wpm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_integrations: {
        Row: {
          client_id: string
          created_at: string
          field_map: Json
          id: string
          integration_type: string
          is_active: boolean
          metadata: Json
          name: string
          provider: string
          secret_reference: string | null
          updated_at: string
          webhook_url_encrypted: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          field_map?: Json
          id?: string
          integration_type: string
          is_active?: boolean
          metadata?: Json
          name: string
          provider: string
          secret_reference?: string | null
          updated_at?: string
          webhook_url_encrypted?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          field_map?: Json
          id?: string
          integration_type?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          provider?: string
          secret_reference?: string | null
          updated_at?: string
          webhook_url_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wpm_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_knowledge_sources: {
        Row: {
          bot_profile_id: string | null
          client_id: string
          content_text: string | null
          created_at: string
          external_file_id: string | null
          external_vector_store_id: string | null
          id: string
          metadata: Json
          source_type: string
          source_url: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bot_profile_id?: string | null
          client_id: string
          content_text?: string | null
          created_at?: string
          external_file_id?: string | null
          external_vector_store_id?: string | null
          id?: string
          metadata?: Json
          source_type: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bot_profile_id?: string | null
          client_id?: string
          content_text?: string | null
          created_at?: string
          external_file_id?: string | null
          external_vector_store_id?: string | null
          id?: string
          metadata?: Json
          source_type?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_knowledge_sources_bot_profile_id_fkey"
            columns: ["bot_profile_id"]
            isOneToOne: false
            referencedRelation: "wpm_bot_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_knowledge_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_leads: {
        Row: {
          assigned_to: string | null
          client_id: string
          conversation_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          intent: string | null
          last_contact_at: string | null
          phone: string | null
          qualification_data: Json
          service_interest: string | null
          source_channel: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          intent?: string | null
          last_contact_at?: string | null
          phone?: string | null
          qualification_data?: Json
          service_interest?: string | null
          source_channel?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          intent?: string | null
          last_contact_at?: string | null
          phone?: string | null
          qualification_data?: Json
          service_interest?: string | null
          source_channel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wpm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_messages: {
        Row: {
          attachments: Json
          client_id: string
          content: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          metadata: Json
          model_name: string | null
          model_provider: string | null
          provider_message_id: string | null
          raw_payload: Json | null
          role: string
          token_usage: Json | null
        }
        Insert: {
          attachments?: Json
          client_id: string
          content?: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          role: string
          token_usage?: Json | null
        }
        Update: {
          attachments?: Json
          client_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          role?: string
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "wpm_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wpm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_tool_executions: {
        Row: {
          client_id: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_payload: Json
          integration_id: string | null
          latency_ms: number | null
          output_payload: Json | null
          status: string
          tool_name: string
        }
        Insert: {
          client_id: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          integration_id?: string | null
          latency_ms?: number | null
          output_payload?: Json | null
          status?: string
          tool_name: string
        }
        Update: {
          client_id?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_payload?: Json
          integration_id?: string | null
          latency_ms?: number | null
          output_payload?: Json | null
          status?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_tool_executions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_tool_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wpm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_tool_executions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "wpm_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      wpm_webhook_events: {
        Row: {
          channel_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          event_type: string | null
          external_event_id: string | null
          id: string
          normalized_payload: Json | null
          processed_at: string | null
          provider: string
          raw_payload: Json
          response_payload: Json | null
          status: string
        }
        Insert: {
          channel_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          normalized_payload?: Json | null
          processed_at?: string | null
          provider?: string
          raw_payload?: Json
          response_payload?: Json | null
          status?: string
        }
        Update: {
          channel_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          id?: string
          normalized_payload?: Json | null
          processed_at?: string | null
          provider?: string
          raw_payload?: Json
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wpm_webhook_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "wpm_client_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_webhook_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "wpm_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wpm_webhook_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wpm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_bot_for_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: Json }
      get_plan_limits: {
        Args: { p_user_id: string }
        Returns: {
          max_bots: number
          max_channels: number
        }[]
      }
      get_wpm_usage: {
        Args: { p_user_id: string }
        Returns: {
          conversations_used: number
          free_messages_limit: number
          max_conversations: number
          messages_in: number
          messages_lifetime: number
          messages_out: number
          period_start: string
          tokens_used: number
          within_allowance: boolean
        }[]
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
