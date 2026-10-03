import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Signal Desk · Evidence workspace', description: 'A working hackathon starter with explicit replay and live modes.' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
