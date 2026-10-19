import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/navigation';
import { SITE } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-(--layout-gutter) py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-semibold text-fg">{SITE.name}</p>
          <p className="mt-1 text-fg-muted">{SITE.tagline}</p>
        </div>
        <nav aria-label="Pie de página" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center text-fg transition-colors duration-(--duration-fast) hover:text-accent-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
