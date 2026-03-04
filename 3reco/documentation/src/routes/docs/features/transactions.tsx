import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/transactions.mdx'

export const Route = createFileRoute('/docs/features/transactions')({
  component: () => <Content />,
})
