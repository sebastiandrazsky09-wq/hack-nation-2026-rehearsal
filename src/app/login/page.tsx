import { serverSupabase } from '../../server/supabase';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
async function requestGuest() {
  'use server';
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error('Unable to create a guest session. Enable anonymous sign-ins in your dedicated Supabase project.');
  redirect('/');
}
export default function Login() {
  return <main className="login"><h1>Private guest session</h1><p>This demo session keeps saved work separate by session. It does not verify your identity, and clearing browser data loses access. Enable Supabase anonymous sign-ins before using it.</p><form action={requestGuest}><button type="submit">Start guest session</button></form><a href="/">Return to workspace</a></main>;
}
