import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/deployment.mdx'

export const Route = createFileRoute('/docs/dev/deployment')({
  component: () => <Content />,
})
