import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/roles.mdx'

export const Route = createFileRoute('/docs/user/roles')({
  component: () => <Content />,
})
