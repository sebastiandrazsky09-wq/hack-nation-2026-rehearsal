import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Ordinal · Rental housing law by address', description: 'Which housing rules apply at an address on a date, with the source text. Not legal advice.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
