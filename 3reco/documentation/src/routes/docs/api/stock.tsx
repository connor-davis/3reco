import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/api/stock.mdx'

export const Route = createFileRoute('/docs/api/stock')({
  component: () => <Content />,
})
