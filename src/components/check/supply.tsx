'use client';
import { useId, useState } from 'react';

export const FACT_INPUT_LABELS: Record<string, string> = { units: 'Number of units', year_built: 'Year built' };
const BOUNDS: Record<string, { min: number; max: number }> = { units: { min: 1, max: 100000 }, year_built: { min: 1600, max: 2100 } };

/**
 * A number field with its own Supply button, for a fact the record does not hold. Enter supplies. It is a div, not a form,
 * because it also sits inside the Check form. `label` is the visible text; `ariaLabel` replaces it for screen readers when
 * the same fact is asked for in two places.
 */
export function SupplyInput({ fact, label, ariaLabel, error, onSupply }: {
  fact: string; label?: string; ariaLabel?: string; error?: string; onSupply: (fact: string, value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const bounds = BOUNDS[fact] ?? { min: 1, max: 100000 };
  const supply = () => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onSupply(fact, n);
  };
  return (
    <div className="ck-supply">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="ck-supply-row">
        <input
          id={id} type="number" inputMode="numeric" step={1} min={bounds.min} max={bounds.max} value={text} aria-label={ariaLabel}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} data-fact={fact}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); supply(); } }}
        />
        <button type="button" className="ck-button" aria-label={`Supply ${FACT_INPUT_LABELS[fact]?.toLowerCase() ?? fact}${ariaLabel ? ' (facts table)' : ''}`} onClick={supply}>Supply</button>
      </div>
      {error && <p id={`${id}-err`} className="ck-field-error">{error}</p>}
    </div>
  );
}
