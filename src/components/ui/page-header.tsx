import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb {
  label: string;
  /** Omit on the last crumb, which is the current page. */
  href?: string;
}

/**
 * Top of a page: an optional breadcrumb (detail pages), the title and subtitle
 * on the left, actions on the right. Wraps on a narrow screen.
 *
 * Renders the page's one <h1>.
 */
export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
}: {
  breadcrumb?: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1.5 text-small text-muted">
              {breadcrumb.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden>/</span> : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-accent underline underline-offset-[3px]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <h1 className="mb-1 font-heading text-title font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {subtitle ? <p className="text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
