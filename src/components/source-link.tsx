'use client';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { safeHref } from './gate-client';

/** A link to a source only when its address is http or https. A source header is untrusted input: anything else is shown as text. */
export function SourceLink({ url, children, icon = false }: { url: string | null | undefined; children: ReactNode; icon?: boolean }) {
  const href = safeHref(url);
  if (!href) return <span title="The stored source address is not a web link, so it is not clickable.">{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}{icon && <ExternalLink size={12} strokeWidth={1.75} aria-hidden />}</a>;
}
