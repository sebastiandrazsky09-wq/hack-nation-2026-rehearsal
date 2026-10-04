import type { Metadata } from 'next';
import { Libre_Caslon_Text, Libre_Franklin } from 'next/font/google';
import { Shell } from '../components/shell';
import { PRODUCT_NAME } from '../lib/product';
import './globals.css';
import './check.css';
import './portfolio.css';

// Libre Franklin for everything Ordinal says; Libre Caslon Text only for text copied word for word from a source.
const ui = Libre_Franklin({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const law = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-law', display: 'swap' });

export const metadata: Metadata = { title: `${PRODUCT_NAME} · Legal decision gate`, description: 'Checks a proposed action on a property against the law in force there on a date: PASS, BLOCK, REQUIRE or REVIEW, with the determining rules and the quoted source. Not legal advice.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${ui.variable} ${law.variable}`}><body><Shell>{children}</Shell></body></html>;
}
