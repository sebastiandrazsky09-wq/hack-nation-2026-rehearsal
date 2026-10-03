import { serverSupabase } from './supabase';
import { BriefSchema } from '../contracts/brief';
export async function saveBrief(result: unknown) {
  const validated = BriefSchema.parse(result);
  const client = await serverSupabase();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in before saving');
  const { data, error } = await client.from('runs').insert({ owner_id: user.id, result: validated }).select('id').single();
  if (error) throw new Error('Unable to save private run');
  return data.id as string;
}
export async function uploadDocument(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Maximum document size is 10 MB');
  const client = await serverSupabase();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in before uploading');
  const path = `${user.id}/${crypto.randomUUID()}`;
  const { error } = await client.storage.from('documents').upload(path, file, { upsert: false });
  if (error) throw new Error('Unable to upload private document');
  return path;
}
