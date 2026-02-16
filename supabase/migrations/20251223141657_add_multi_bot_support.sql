/*
  # Add Multi-Bot Support

  1. New Tables
    - `ai_bots`
      - `id` (uuid, primary key) - Unique identifier for each bot
      - `user_id` (uuid, references auth.users) - Owner of the bot configuration
      - `name` (text) - User-friendly name (e.g., "Customer Support Bot")
      - `description` (text, nullable) - Optional description of bot purpose
      - `assistant_id` (text) - OpenAI Assistant ID for this bot
      - `api_key` (text, nullable) - Optional override API key
      - `is_active` (boolean) - Whether this bot is currently selected
      - `color` (text) - Badge color for visual identification
      - `icon` (text) - Icon identifier for this bot
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Modifications
    - Add `bot_id` to `chat_threads` table to track which bot was used
    - Add `bot_name` to `chat_threads` for denormalized display
  
  3. Security
    - Enable RLS on `ai_bots` table
    - Users can only access and manage their own bots
    - Add policies for SELECT, INSERT, UPDATE, DELETE
  
  4. Data Migration
    - Create default bot for existing users with their current OpenAI settings
    - Associate existing chat threads with default bot
*/

-- Create ai_bots table
CREATE TABLE IF NOT EXISTS ai_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  assistant_id text NOT NULL,
  api_key text,
  is_active boolean DEFAULT false,
  color text DEFAULT 'cyan',
  icon text DEFAULT 'Bot',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add bot tracking to chat_threads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_threads' AND column_name = 'bot_id'
  ) THEN
    ALTER TABLE chat_threads ADD COLUMN bot_id uuid REFERENCES ai_bots(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_threads' AND column_name = 'bot_name'
  ) THEN
    ALTER TABLE chat_threads ADD COLUMN bot_name text;
  END IF;
END $$;

-- Enable RLS on ai_bots
ALTER TABLE ai_bots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_bots
CREATE POLICY "Users can view their own bots"
  ON ai_bots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bots"
  ON ai_bots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bots"
  ON ai_bots
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bots"
  ON ai_bots
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_bots_user_id ON ai_bots(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_bots_active ON ai_bots(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chat_threads_bot_id ON chat_threads(bot_id);

-- Function to ensure only one bot is active per user
CREATE OR REPLACE FUNCTION ensure_single_active_bot()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE ai_bots
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single active bot
DROP TRIGGER IF EXISTS trigger_ensure_single_active_bot ON ai_bots;
CREATE TRIGGER trigger_ensure_single_active_bot
  BEFORE INSERT OR UPDATE ON ai_bots
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION ensure_single_active_bot();

-- Function to create default bot for users with existing settings
CREATE OR REPLACE FUNCTION create_default_bot_for_user(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_bot_id uuid;
  v_assistant_id text;
  v_api_key text;
BEGIN
  SELECT openai_assistant_id, openai_api_key
  INTO v_assistant_id, v_api_key
  FROM user_settings
  WHERE user_id = p_user_id;
  
  IF v_assistant_id IS NOT NULL THEN
    INSERT INTO ai_bots (user_id, name, description, assistant_id, api_key, is_active, color, icon)
    VALUES (
      p_user_id,
      'Default Assistant',
      'Your primary AI assistant',
      v_assistant_id,
      v_api_key,
      true,
      'cyan',
      'Bot'
    )
    RETURNING id INTO v_bot_id;
    
    UPDATE chat_threads
    SET bot_id = v_bot_id,
        bot_name = 'Default Assistant'
    WHERE user_id = p_user_id
      AND bot_id IS NULL;
    
    RETURN v_bot_id;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;