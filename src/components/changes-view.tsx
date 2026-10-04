'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { ChangesPanel } from './changes-panel';
import { useApi } from './use-api';

/** /changes: choosing an affected address opens it on /record at the case date. */
export function ChangesView() {
  const router = useRouter();
  const addressesApi = useApi<{ addresses: { address_id: string; legal_city: string | null }[] }>('/api/addresses');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);
  const open = (id: string, asOf: string) => router.push(`/record?${new URLSearchParams({ address: id, as_of: asOf })}`);
  return (
    <main className="page main">
      <ChangesPanel addresses={addresses} onOpen={open} />
    </main>
  );
}
