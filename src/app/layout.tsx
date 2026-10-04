import type { Metadata } from 'next';
import { Geist_Mono, Host_Grotesk } from 'next/font/google';
import { Shell } from '../components/shell';
import { PRODUCT_NAME } from '../lib/product';
import './globals.css';
import './check.css';
import './portfolio.css';

// One grotesque for everything, one mono for ids, citations and payloads.
const ui = Host_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = { title: `${PRODUCT_NAME} · The legal envelope`, description: 'Checks a proposed action on a property against the law in force there on a date: PASS, BLOCK, REQUIRE or REVIEW, with the determining rules and the quoted source. Not legal advice.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${ui.variable} ${mono.variable}`}><body><Shell>{children}</Shell></body></html>;
}
