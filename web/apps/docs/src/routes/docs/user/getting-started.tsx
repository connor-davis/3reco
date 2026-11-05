import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/getting-started.mdx'

export const Route = createFileRoute('/docs/user/getting-started')({
  component: () => <Content />,
})
