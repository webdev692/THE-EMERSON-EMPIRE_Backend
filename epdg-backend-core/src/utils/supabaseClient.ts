import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

let client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    client = createClient(url, key, {
      realtime: { transport: ws as any },
    });
  }
  return client;
}

export const CV_BUCKET = 'cv-uploads';
