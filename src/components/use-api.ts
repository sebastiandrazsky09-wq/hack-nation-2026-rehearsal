'use client';
import { useEffect, useState } from 'react';
/** GET json. `data` and `error` only ever belong to the current url, so a new address or date never shows an old answer. A request that is no longer wanted is cancelled. */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `The request failed (status ${r.status}).`);
        if (live) setState({ url, data: body as T });
      })
      .catch(e => { if (live) setState({ url, error: e instanceof TypeError ? 'Could not reach the server. Check your connection and try again.' : e.message }); });
    return () => { live = false; controller.abort(); };
  }, [url]);
  const current = url && state?.url === url ? state : null;
  return { data: current?.data, error: current?.error, loading: Boolean(url) && !current };
}
