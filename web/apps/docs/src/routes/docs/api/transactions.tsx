import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/api/transactions.mdx'

export const Route = createFileRoute('/docs/api/transactions')({
  component: () => <Content />,
})
