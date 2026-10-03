import { RESULT_LABELS, RESULT_MEANINGS, label } from './labels';

/**
 * One mark per answer, so a state is never carried by colour alone:
 * disc (applies), triangle (unknown), barred ring (superseded), ring (not yet effective), dashed ring (pending).
 */
export function SignalMark({ result, size = 16 }: { result: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false, className: `mark mark-${result}` } as const;
  switch (result) {
    case 'applies':
      return <svg {...common}><circle cx="8" cy="8" r="6" fill="currentColor" /><path d="M5.2 8.2l1.9 1.9 3.7-4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'unknown':
      return <svg {...common}><path d="M8 1.8l6.4 11.4H1.6z" fill="currentColor" strokeLinejoin="round" /><path d="M8 6v3.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.3" r="0.9" fill="#fff" /></svg>;
    case 'superseded':
      return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M4.4 8h7.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>;
    case 'not_yet_effective':
      return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M8 4.9V8l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'pending':
      return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeDasharray="2.4 2.2" /></svg>;
    case 'not_applicable':
      return <svg {...common}><circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
    case 'failed':
      return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.75" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
    default:
      return <svg {...common}><circle cx="8" cy="8" r="3" fill="currentColor" /></svg>;
  }
}

export function FlagMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden focusable={false} className="mark mark-conflict">
      <path d="M3.5 14V2.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M3.5 2.8h8.2l-1.9 3 1.9 3H3.5z" fill="currentColor" />
    </svg>
  );
}

/** The answer for one rule: mark plus word. The word is the whole text content, so it reads the same to everyone. */
export function ResultBadge({ result }: { result: string }) {
  return (
    <span data-testid="result-badge" className={`signal signal-${result}`} title={RESULT_MEANINGS[result]}>
      <SignalMark result={result} />{label(RESULT_LABELS, result)}
    </span>
  );
}
