import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/api/users.mdx'

export const Route = createFileRoute('/docs/api/users')({
  component: () => <Content />,
})
