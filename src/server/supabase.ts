import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
export async function serverSupabase() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: { getAll: () => store.getAll(), setAll: entries => { for (const { name, value, options } of entries) store.set(name, value, options); } }
  });
}
