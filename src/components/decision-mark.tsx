import type { Decision } from '../gate/contract';

/**
 * One shape per decision, so a state is never carried by colour alone:
 * filled square (BLOCK), triangle (REVIEW), list mark (REQUIRE), open ring (PASS). PASS has no fill and no tick: it is not a verdict of legality.
 */
export function DecisionMark({ decision, size = 16 }: { decision: Decision; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false, className: `dmark dmark-${decision}` } as const;
  switch (decision) {
    case 'BLOCK': return <svg {...common}><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor" /></svg>;
    case 'REVIEW': return <svg {...common}><path d="M8 1.8l6.4 11.4H1.6z" fill="currentColor" /><path d="M8 6v3.4" stroke="#fff3d1" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.3" r="0.9" fill="#fff3d1" /></svg>;
    case 'REQUIRE': return <svg {...common}><path d="M2.5 4h2M2.5 8h2M2.5 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /><path d="M7 4h6.5M7 8h6.5M7 12h6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>;
    case 'PASS': return <svg {...common}><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.75" /></svg>;
  }
}

/** Mark plus word. The word is the whole text content. */
export function DecisionWord({ decision, size = 14 }: { decision: Decision; size?: number }) {
  return <span className={`dword dword-${decision}`} data-testid="decision-word"><DecisionMark decision={decision} size={size} />{decision}</span>;
}
