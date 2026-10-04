'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRODUCT_NAME } from '../lib/product';

/** The views, in nav order. */
export const NAV: { href: string; name: string; short?: string }[] = [
  { href: '/', name: 'Check' },
  { href: '/portfolio', name: 'Portfolio' },
  { href: '/record', name: 'Property record', short: 'Record' },
  { href: '/changes', name: 'Law changes', short: 'Changes' },
  { href: '/system', name: 'System' }
];

function Logo() {
  // The mark is the gate itself: a square with an opening.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable={false}>
      <rect x="0" y="0" width="18" height="18" rx="4" fill="currentColor" />
      <rect x="7.75" y="4" width="2.5" height="10" rx="1.25" fill="#fff" />
    </svg>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app">
      <header className="topbar">
        <div className="page topbar-inner">
          <h1 className="brand"><Logo />{PRODUCT_NAME}</h1>
          <nav aria-label="Views" className="tabs">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}>
                {/* The full name is always the accessible name; a narrow screen shows the short one. */}
                {n.short ? <><span className="nav-long">{n.name}</span><span className="nav-short" aria-hidden>{n.short}</span></> : n.name}
              </Link>
            ))}
          </nav>
          <p role="note" className="notice"><strong>Not legal advice.</strong> A prototype: check the cited source.</p>
        </div>
      </header>
      {children}
    </div>
  );
}
