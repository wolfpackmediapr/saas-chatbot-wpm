/*
  # Add user activity logging

  1. New Tables
    - `user_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `action` (text) - The type of action performed
      - `details` (jsonb) - Additional details about the action
      - `ip_address` (text) - User's IP address
      - `user_agent` (text) - User's browser/device info
      - `created_at` (timestamptz) - When the action occurred
  
  2. Security
    - Enable RLS on user_logs table
    - Add policies for authenticated users
*/

-- Create user_logs table
CREATE TABLE IF NOT EXISTS user_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at);

-- Enable RLS
ALTER TABLE user_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own logs"
  ON user_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow insert for authenticated users
CREATE POLICY "Users can create their own logs"
  ON user_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);