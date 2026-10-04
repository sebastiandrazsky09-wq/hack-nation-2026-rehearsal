'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACTIONS, ACTION_NAMES, SUBJECT_LABELS, SUBJECT_TYPES, canonicalRequest,
  type ActionName, type CallerFacts, type CheckRequest, type CheckResponse, type Decision
} from '../../gate/contract';
import { postCheck } from '../gate-client';
import { isIsoDate, longDate } from '../labels';
import { optionText, type AddressRow } from '../record/address';
import { AddressSearch } from '../record/address-search';
import { useApi } from '../use-api';
import { Coverage, DecisionBlock, Determining, Evidence, Obligations, Payload, TimeSection, Trace, Unresolved } from './sections';
import { SupplyInput } from './supply';

type Issue = { path: string; message: string };
type Form = { subject: CheckRequest['subject']['type']; action: ActionName; amount: string; property: string; asOf: string; facts: CallerFacts };
type PropertyLabel = Pick<AddressRow, 'address_id' | 'street_address' | 'postal_city' | 'state'>;

const FACT_ROWS: { name: string; label: string }[] = [{ name: 'year_built', label: 'Year built' }, { name: 'units', label: 'Units' }, { name: 'use_description', label: 'Use' }];
const SOURCE_WORDS = { record: 'from the record', caller: 'supplied by you', missing: 'not in the record' } as const;
const URL_PARAMETER = { amount_months_rent: 'amount', fee_usd: 'fee' } as const;

function formOf(request: CheckRequest): Form {
  const parameter = ACTIONS[request.action.name].parameter;
  return {
    subject: request.subject.type, action: request.action.name,
    amount: parameter ? String(request.action.properties?.[parameter.name] ?? parameter.example) : '',
    property: request.resource.id, asOf: request.context?.as_of ?? '', facts: request.context?.facts ?? {}
  };
}

/** The canonical request the form describes, or null while a field holds something that is not a number or a date. */
function requestOf(form: Form): CheckRequest | null {
  const parameter = ACTIONS[form.action].parameter;
  const value = Number(form.amount);
  if (parameter && (form.amount.trim() === '' || !Number.isFinite(value))) return null;
  if (!isIsoDate(form.asOf)) return null;
  return canonicalRequest({
    subject: { type: form.subject },
    action: { name: form.action, ...(parameter ? { properties: { [parameter.name]: value } } : {}) },
    resource: { type: 'property', id: form.property },
    context: { as_of: form.asOf, facts: form.facts }
  }, form.asOf);
}

const keyOf = (form: Form) => { const r = requestOf(form); return r ? JSON.stringify(r) : 'invalid'; };

function writeUrl(request: CheckRequest) {
  const parameter = ACTIONS[request.action.name].parameter;
  const params = new URLSearchParams({ subject: request.subject.type, action: request.action.name, property: request.resource.id, as_of: request.context?.as_of ?? '' });
  if (parameter) params.set(URL_PARAMETER[parameter.name], String(request.action.properties?.[parameter.name]));
  const facts = request.context?.facts;
  if (facts?.units !== undefined) params.set('units', String(facts.units));
  if (facts?.year_built !== undefined) params.set('year_built', String(facts.year_built));
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

export function CheckView({ initialRequest, initialResponse, initialProperty }: {
  initialRequest: CheckRequest; initialResponse: CheckResponse; initialProperty: PropertyLabel | null;
}) {
  const startRequest = useMemo(() => canonicalRequest(initialRequest, initialResponse.as_of), [initialRequest, initialResponse.as_of]);
  const [form, setForm] = useState<Form>(() => formOf(startRequest));
  const [query, setQuery] = useState(initialProperty ? optionText(initialProperty) : startRequest.resource.id);
  const [committed, setCommitted] = useState(() => JSON.stringify(startRequest));
  const [nonce, setNonce] = useState(0);
  const [response, setResponse] = useState(initialResponse);
  const [shownRequest, setShownRequest] = useState(startRequest);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [was, setWas] = useState<Decision | null>(null);
  const [tint, setTint] = useState(false);
  const [editing, setEditing] = useState(false);
  const applied = useRef({ key: JSON.stringify(startRequest), nonce: 0 });
  const shown = useRef(initialResponse);
  const addressesApi = useApi<{ addresses: AddressRow[] }>('/api/addresses');
  const addresses = useMemo(() => addressesApi.data?.addresses ?? [], [addressesApi.data]);

  const liveKey = useMemo(() => keyOf(form), [form]);
  // Typed fields settle for 150 ms before they ask; choices and buttons call `change` with `now` and ask at once.
  useEffect(() => { const timer = setTimeout(() => setCommitted(liveKey), 150); return () => clearTimeout(timer); }, [liveKey]);
  const change = (next: Form, now = true) => { setForm(next); if (now) setCommitted(keyOf(next)); };

  useEffect(() => {
    if (committed === 'invalid') return;
    if (committed === applied.current.key && nonce === applied.current.nonce) return;
    const request = JSON.parse(committed) as CheckRequest;
    const controller = new AbortController();
    setBusy(true);
    writeUrl(request);
    postCheck(request, controller.signal).then(result => {
      applied.current = { key: committed, nonce };
      setBusy(false);
      if (result.ok) {
        if (result.data.decision !== shown.current.decision) { setWas(shown.current.decision); setTint(true); }
        shown.current = result.data;
        setResponse(result.data); setShownRequest(request); setIssues([]); setError(null);
      } else if (result.status === 400 && result.error.issues?.length) {
        setIssues(result.error.issues); setError(null);
      } else {
        setIssues([]); setError(result.error.message);
      }
    }, (e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) { setBusy(false); setError('The request failed.'); } });
    return () => controller.abort();
  }, [committed, nonce]);

  useEffect(() => {
    if (!tint) return;
    const timer = setTimeout(() => setTint(false), 900);
    return () => clearTimeout(timer);
  }, [tint]);

  const spec = ACTIONS[form.action];
  const parameter = spec.parameter;
  const localInvalid = liveKey === 'invalid';
  const issueAt = (suffix: string) => issues.find(i => i.path.endsWith(suffix))?.message;
  const parameterIssue = parameter ? issueAt(parameter.name) : undefined;
  const dateIssue = issueAt('as_of');
  const factIssue = (fact: string) => issueAt(`facts.${fact}`);
  const otherIssues = issues.filter(i => !i.path.endsWith('as_of') && !i.path.includes('facts.') && !(parameter && i.path.endsWith(parameter.name)));
  const invalid = issues.length > 0 || localInvalid;

  const supply = (fact: string, value: number) => change({ ...form, facts: { ...form.facts, [fact]: value } });
  const remove = (fact: 'units' | 'year_built') => { const facts = { ...form.facts }; delete facts[fact]; change({ ...form, facts }); };
  const propertyHref = `/record?address=${encodeURIComponent(form.property)}&as_of=${encodeURIComponent(form.asOf)}`;
  const parameterText = parameter && form.amount ? `, ${form.amount} ${parameter.unit}` : '';

  return (
    <main className="page main ck-page">
      <div className="ck-recap">
        <p>{spec.label}{parameterText}</p>
        <p>{query || form.property}</p>
        <p>{isIsoDate(form.asOf) ? longDate(form.asOf) : 'No valid date'}</p>
        <button type="button" className="button-quiet" aria-expanded={editing} aria-controls="ck-form" onClick={() => setEditing(v => !v)}>{editing ? 'Close' : 'Edit'}</button>
      </div>

      <form id="ck-form" className="ck-form" data-open={editing} onSubmit={e => { e.preventDefault(); setCommitted(liveKey); setNonce(n => n + 1); }} noValidate>
        <h2>Proposed action</h2>
        <div className="field">
          <label htmlFor="ck-subject">Actor</label>
          <select id="ck-subject" value={form.subject} onChange={e => change({ ...form, subject: e.target.value as Form['subject'] })}>
            {SUBJECT_TYPES.map(t => <option key={t} value={t}>{SUBJECT_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ck-action">Action</label>
          <select id="ck-action" value={form.action} onChange={e => { const action = e.target.value as ActionName; change({ ...form, action, amount: String(ACTIONS[action].parameter?.example ?? '') }); }}>
            {ACTION_NAMES.map(n => <option key={n} value={n}>{ACTIONS[n].short}</option>)}
          </select>
          {spec.label !== spec.short && <p className="ck-note ck-definition">Checked as: {spec.label.charAt(0).toLowerCase() + spec.label.slice(1)}.</p>}
          <p className="ck-note">Not gated: raise the rent, end a tenancy, screen an applicant. Their rules are in the <Link href={propertyHref}>property record</Link>.</p>
        </div>
        {parameter && (
          <div className="field">
            <label htmlFor="ck-parameter">{parameter.label}, {parameter.unit}</label>
            <input
              id="ck-parameter" type="number" inputMode="decimal" step={parameter.unit === 'US dollars' ? 1 : 0.5} value={form.amount}
              aria-invalid={parameterIssue || form.amount.trim() === '' ? true : undefined} aria-describedby="ck-parameter-err"
              onChange={e => change({ ...form, amount: e.target.value }, false)}
            />
            <p id="ck-parameter-err" className="ck-field-error">{parameterIssue ?? (form.amount.trim() === '' ? 'Enter a number.' : '')}</p>
          </div>
        )}
        <AddressSearch
          id="ck-property" label="Property" addresses={addresses} query={query} onQuery={setQuery}
          onChoose={a => change({ ...form, property: a.address_id, facts: {} })} error={addressesApi.error}
        />
        <div className="field field-date">
          <label htmlFor="ck-as-of">As of</label>
          <input id="ck-as-of" type="date" value={form.asOf} aria-invalid={dateIssue || !isIsoDate(form.asOf) ? true : undefined} aria-describedby="ck-as-of-err" onChange={e => change({ ...form, asOf: e.target.value }, false)} />
          <p id="ck-as-of-err" className="ck-field-error">{dateIssue ?? (isIsoDate(form.asOf) ? '' : 'Enter a real date.')}</p>
        </div>
        <div className="ck-facts">
          <h3>Facts</h3>
          <table>
            <tbody>
              {response.facts.length > 0 && FACT_ROWS.map(row => {
                const fact = response.facts.find(f => f.name === row.name);
                if (!fact) return null;
                const suppliable = (row.name === 'units' || row.name === 'year_built') ? row.name : null;
                return (
                  <tr key={row.name} data-fact={row.name}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {fact.source === 'missing' && suppliable
                        ? <SupplyInput fact={suppliable} ariaLabel={`${row.label}, supply a value`} error={factIssue(suppliable)} onSupply={supply} />
                        : <span className="ck-fact-value">{fact.value ?? '—'}</span>}
                      <span className="ck-fact-source">{SOURCE_WORDS[fact.source]}</span>
                      {fact.source === 'caller' && suppliable && <button type="button" className="link ck-remove" onClick={() => remove(suppliable)} aria-label={`Remove ${row.label.toLowerCase()}`}>Remove</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="submit" className="ck-primary">Check</button>
      </form>

      <div className={`ck-result${error ? ' ck-dim' : ''}`} aria-busy={busy}>
        {error && <p role="alert" className="error ck-error">{error}</p>}
        {invalid && !error && <p role="alert" className="ck-invalid">Not updated: the request is invalid.</p>}
        {otherIssues.length > 0 && <ul className="ck-field-error" role="alert">{otherIssues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
        <DecisionBlock response={response} was={was} tint={tint} />
        <Determining rows={response.determining} evidence={response.evidence} review={response.review} />
        <Obligations items={response.obligations} />
        <Unresolved items={response.review} titles={new Map(response.trace.map(t => [t.rule_id, t.title]))} issueFor={factIssue} onSupply={supply} />
        <TimeSection response={response} asOf={form.asOf && isIsoDate(form.asOf) ? form.asOf : response.as_of} onDate={date => change({ ...form, asOf: date })} />
        <Trace trace={response.trace} />
        <Evidence evidence={response.evidence} />
        <Coverage response={response} />
        <Payload request={shownRequest} response={response} />
      </div>
    </main>
  );
}
