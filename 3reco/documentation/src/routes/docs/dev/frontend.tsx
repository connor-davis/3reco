import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/frontend.mdx'

export const Route = createFileRoute('/docs/dev/frontend')({
  component: () => <Content />,
})
