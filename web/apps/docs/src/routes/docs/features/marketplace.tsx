import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/marketplace.mdx'

export const Route = createFileRoute('/docs/features/marketplace')({
  component: () => <Content />,
})
