import { streetCase } from '../labels';

export type AddressRow = {
  address_id: string; street_address: string; postal_city: string; state: string; zip: string;
  year_built: number | null; units: number | null; use_description: string; legal_city: string | null;
};
export const optionText = (a: Pick<AddressRow, 'address_id' | 'street_address' | 'postal_city' | 'state'>) => `${streetCase(a.street_address)}, ${a.postal_city}, ${a.state} (${a.address_id})`;
export const cityName = (legal: string | null) => legal?.split(',')[0] ?? null;
