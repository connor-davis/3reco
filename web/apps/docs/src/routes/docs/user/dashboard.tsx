import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/dashboard.mdx'

export const Route = createFileRoute('/docs/user/dashboard')({
  component: () => <Content />,
})
