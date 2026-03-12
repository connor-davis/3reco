import type { ReactNode } from 'react';
import PageHeaderActions from '@/components/page-header-actions';

export default function PageHeaderDropdown({
  children,
}: {
  children: ReactNode;
}) {
  return <PageHeaderActions>{children}</PageHeaderActions>;
}
