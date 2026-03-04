import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/invoices.mdx'

export const Route = createFileRoute('/docs/features/invoices')({
  component: () => <Content />,
})
