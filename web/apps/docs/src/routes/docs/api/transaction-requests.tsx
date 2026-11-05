import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/api/transaction-requests.mdx'

export const Route = createFileRoute('/docs/api/transaction-requests')({
  component: () => <Content />,
})
