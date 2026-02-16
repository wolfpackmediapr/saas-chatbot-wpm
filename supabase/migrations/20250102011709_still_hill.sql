/*
  # Fix user logs policies

  1. Changes
    - Safely drop existing policies if they exist
    - Recreate policies for user_logs table
  
  2. Security
    - Maintain RLS on user_logs table
    - Recreate policies for viewing and creating logs
*/

-- Safely drop existing policies
DO $$ 
BEGIN
  -- Drop view policy if exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_logs' 
    AND policyname = 'Users can view their own logs'
  ) THEN
    DROP POLICY "Users can view their own logs" ON user_logs;
  END IF;

  -- Drop create policy if exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_logs' 
    AND policyname = 'Users can create their own logs'
  ) THEN
    DROP POLICY "Users can create their own logs" ON user_logs;
  END IF;
END $$;

-- Recreate policies
CREATE POLICY "Users can view their own logs"
  ON user_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own logs"
  ON user_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);