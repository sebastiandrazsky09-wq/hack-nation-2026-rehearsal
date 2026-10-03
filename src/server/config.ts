export function appMode(): 'live' | 'replay' {
  const mode = process.env.APP_MODE ?? 'replay';
  if (mode !== 'live' && mode !== 'replay') throw new Error('APP_MODE must be live or replay');
  if (mode === 'live' && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('Live mode requires a server-side provider key');
  }
  if (mode === 'live' && (process.env.DEMO_ACCESS_TOKEN?.length ?? 0) < 24) {
    throw new Error('Live mode requires a random DEMO_ACCESS_TOKEN of at least 24 characters');
  }
  return mode;
}
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  new URL(url);
  return { url, key };
}
