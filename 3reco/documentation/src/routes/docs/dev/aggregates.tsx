import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/aggregates.mdx'

export const Route = createFileRoute('/docs/dev/aggregates')({
  component: () => <Content />,
})
