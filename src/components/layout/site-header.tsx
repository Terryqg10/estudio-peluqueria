import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/navigation';
import { SITE } from '@/lib/site';
import { ROUTES } from '@/lib/routes';
import { MobileMenu } from '@/components/layout/mobile-menu';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <div className="mx-auto flex h-(--nav-height) w-full max-w-6xl items-center justify-between gap-4 px-(--layout-gutter)">
        <Link
          href={ROUTES.home}
          className="inline-flex min-h-11 items-center text-xl font-semibold text-fg transition-colors duration-(--duration-fast) hover:text-accent-text"
        >
          {SITE.name}
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-control px-4 text-fg transition-colors duration-(--duration-fast) hover:bg-accent-soft hover:text-accent-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <MobileMenu items={NAV_ITEMS} />
      </div>
    </header>
  );
}
