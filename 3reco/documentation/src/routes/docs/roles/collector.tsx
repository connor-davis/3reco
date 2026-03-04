import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/roles/collector.mdx'

export const Route = createFileRoute('/docs/roles/collector')({
  component: () => <Content />,
})
