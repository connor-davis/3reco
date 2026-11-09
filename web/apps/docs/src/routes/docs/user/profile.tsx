import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/profile.mdx'

export const Route = createFileRoute('/docs/user/profile')({
  component: () => <Content />,
})
