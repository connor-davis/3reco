import type { ReactNode } from 'react';
import PageHeaderActions from '@/components/page-header-actions';

export default function PageHeaderDrawer({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <PageHeaderActions title={title} description={description}>
      {children}
    </PageHeaderActions>
  );
}
