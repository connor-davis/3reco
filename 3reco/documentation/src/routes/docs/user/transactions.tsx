import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/transactions.mdx'

export const Route = createFileRoute('/docs/user/transactions')({
  component: () => <Content />,
})
