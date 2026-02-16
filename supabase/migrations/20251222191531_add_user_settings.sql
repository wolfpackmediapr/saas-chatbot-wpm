/*
  # Add user settings table

  1. New Tables
    - `user_settings`
      - `user_id` (uuid, primary key, references auth.users)
      - `company_logo` (text) - URL or base64 of company logo
      - `response_style` (text) - professional, casual, or friendly
      - `response_length` (text) - concise, balanced, or detailed
      - `openai_api_key` (text) - User's OpenAI API key (encrypted)
      - `openai_assistant_id` (text) - User's OpenAI Assistant ID
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on user_settings table
    - Users can only access their own settings
*/

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_logo text,
  response_style text DEFAULT 'professional',
  response_length text DEFAULT 'balanced',
  openai_api_key text,
  openai_assistant_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policies for user_settings
CREATE POLICY "Users can view their own settings"
  ON user_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to auto-create settings on user signup
CREATE OR REPLACE FUNCTION handle_new_user_settings()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user settings
DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;

CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_settings();
