import { supabase } from './client';

export interface WpmClientRecord {
  id: string;
  name: string;
  description?: string | null;
  timezone?: string | null;
  status?: string | null;
}

/**
 * Returns the current authenticated user's owned WPM client profile.
 * 
 * Falls back to a local demo client when:
 * - Supabase is not configured (common in previews / bolt.new)
 * - No auth session
 * - The wpm_clients table/row doesn't exist yet
 */
export async function getOwnedWpmClient(): Promise<WpmClientRecord | null> {
  if (!supabase) {
    // Graceful dev/preview fallback
    return {
      id: 'demo-client-001',
      name: 'Demo Business',
      description: 'Local development / bolt.new preview client',
    };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Try to find a client record owned by this user.
    // Adjust the column if your schema uses a different link (e.g. owner_user_id).
    const { data, error } = await (supabase as any)
      .from('wpm_clients')
      .select('id, name, description, timezone, status')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error || !data) {
      // Fallback so the app doesn't crash during early setup
      return {
        id: user.id,
        name: 'Your Business',
      };
    }

    return data as WpmClientRecord;
  } catch (err) {
    console.warn('[wpmClients] getOwnedWpmClient error, using fallback:', err);
    return {
      id: 'demo-client-001',
      name: 'Your Business',
    };
  }
}
