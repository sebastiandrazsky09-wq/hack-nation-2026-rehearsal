import type { Metadata } from 'next';
import { Libre_Caslon_Text, Libre_Franklin } from 'next/font/google';
import './globals.css';

// Libre Franklin for everything Ordinal says; Libre Caslon Text only for text copied word for word from a source.
const ui = Libre_Franklin({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const law = Libre_Caslon_Text({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-law', display: 'swap' });

export const metadata: Metadata = { title: 'Ordinal · Rental housing law by address', description: 'Which housing rules apply at an address on a date, with the source text. Not legal advice.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${ui.variable} ${law.variable}`}><body>{children}</body></html>;
}
