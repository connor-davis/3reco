import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/convex-functions.mdx'

export const Route = createFileRoute('/docs/dev/convex-functions')({
  component: () => <Content />,
})
