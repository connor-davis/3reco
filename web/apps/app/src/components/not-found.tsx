import { LinkButton } from '@/components/link-button';
import { PageHeader } from '@/components/page-header';

export function NotFound() {
  return (
    <section>
      <PageHeader
        title="Page not found"
        description="This page may have moved or the address may be wrong."
      />
      <LinkButton to="/">Back to dashboard</LinkButton>
    </section>
  );
}
