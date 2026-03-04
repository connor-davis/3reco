import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/error-handling.mdx'

export const Route = createFileRoute('/docs/dev/error-handling')({
  component: () => <Content />,
})
