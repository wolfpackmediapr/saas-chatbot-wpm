/*
  # Make Assistant ID Optional

  1. Changes
    - Make `assistant_id` column nullable in `ai_bots` table
    - This allows bots to fall back to global assistant ID from user settings

  2. Notes
    - Existing bots with assistant_id will continue to work
    - New bots can be created without assistant_id and use global default
*/

-- Make assistant_id nullable to allow fallback to global settings
ALTER TABLE ai_bots
  ALTER COLUMN assistant_id DROP NOT NULL;
