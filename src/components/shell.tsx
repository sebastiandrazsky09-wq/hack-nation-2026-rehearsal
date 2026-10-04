'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRODUCT_NAME } from '../lib/product';

/** The views, in nav order. Later tasks add "Check" and "Portfolio" in front of this list. */
export const NAV: { href: string; name: string }[] = [
  { href: '/record', name: 'Property record' },
  { href: '/changes', name: 'Law changes' },
  { href: '/system', name: 'System' }
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden focusable={false}>
      <path d="M3 7h16M8 11.5h11M13 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M11 3.5v15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="3.5" r="2.2" fill="currentColor" />
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
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}>{n.name}</Link>
            ))}
          </nav>
          <p role="note" className="notice"><strong>Not legal advice.</strong> A prototype: check the cited source.</p>
        </div>
      </header>
      {children}
    </div>
  );
}
