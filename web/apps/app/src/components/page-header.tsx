import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

/** h1, one line of help, and the page's actions on the right (map section 1). */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-8 sm:gap-6">
      <div className="min-w-0 space-y-1 sm:space-y-2">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-[56ch] text-[15px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

/** A titled block. Sections sit 56px apart on desktop, 40px on phones. */
export function Section({
  title,
  description,
  action,
  children,
}: SectionProps) {
  return (
    <section className="mt-10 sm:mt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
