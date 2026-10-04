// Caller-supplied building facts, accepted only where the registry record has none.
import type { Address } from '../ordinal/contracts';
import type { CallerFacts, CheckResponse } from './contract';
import { GateError } from './http';

export type OverlaidFacts = { address: Address; facts: CheckResponse['facts'] };

/** `strict`: a supplied value that differs from a recorded one is an error. Batch is not strict: the record wins and the value is ignored. */
export function overlayFacts(address: Address, supplied: CallerFacts | undefined, strict: boolean): OverlaidFacts {
  const pick = (name: 'units' | 'year_built') => {
    const recorded = address[name]; const given = supplied?.[name];
    if (recorded !== null) {
      if (strict && given !== undefined && given !== recorded) {
        throw new GateError('fact_conflicts_with_record', 400, `${name} ${given} differs from the recorded value ${recorded}; the record is not overridden.`);
      }
      return { value: recorded, source: 'record' as const };
    }
    return given !== undefined ? { value: given, source: 'caller' as const } : { value: null, source: 'missing' as const };
  };
  const units = pick('units'); const yearBuilt = pick('year_built');
  return {
    address: { ...address, units: units.value, year_built: yearBuilt.value },
    facts: [
      { name: 'year_built', ...yearBuilt },
      { name: 'units', ...units },
      { name: 'use_description', value: address.use_description || null, source: address.use_description ? 'record' : 'missing' }
    ]
  };
}
