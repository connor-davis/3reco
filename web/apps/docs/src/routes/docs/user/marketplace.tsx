import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/marketplace.mdx'

export const Route = createFileRoute('/docs/user/marketplace')({
  component: () => <Content />,
})
