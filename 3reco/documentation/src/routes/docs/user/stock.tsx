import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/stock.mdx'

export const Route = createFileRoute('/docs/user/stock')({
  component: () => <Content />,
})
