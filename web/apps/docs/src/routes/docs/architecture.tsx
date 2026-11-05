import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/architecture.mdx'

export const Route = createFileRoute('/docs/architecture')({
  component: () => <Content />,
})
