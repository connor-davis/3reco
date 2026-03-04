import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/user/notifications.mdx'

export const Route = createFileRoute('/docs/user/notifications')({
  component: () => <Content />,
})
