/*
  # Add chat storage tables

  1. New Tables
    - `chat_threads`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text) - Chat conversation title
      - `created_at` (timestamptz) - When the chat was created
      - `updated_at` (timestamptz) - Last message timestamp
    
    - `chat_messages`
      - `id` (uuid, primary key)
      - `thread_id` (uuid, references chat_threads)
      - `content` (text) - Message content
      - `is_user` (boolean) - True if message is from user
      - `images` (jsonb) - Array of image URLs if any
      - `created_at` (timestamptz) - When message was sent
  
  2. Security
    - Enable RLS on both tables
    - Users can only access their own chat threads and messages
    - Add policies for viewing, creating, updating, and deleting
*/

-- Create chat_threads table
CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT 'New Conversation',
  openai_thread_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  is_user boolean NOT NULL DEFAULT true,
  images jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at ON chat_threads(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Enable RLS
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for chat_threads
CREATE POLICY "Users can view their own chat threads"
  ON chat_threads
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat threads"
  ON chat_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat threads"
  ON chat_threads
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat threads"
  ON chat_threads
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for chat_messages
CREATE POLICY "Users can view messages in their threads"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their threads"
  ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update messages in their threads"
  ON chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages in their threads"
  ON chat_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );
