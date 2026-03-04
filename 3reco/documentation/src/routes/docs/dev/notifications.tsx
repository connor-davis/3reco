import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/notifications.mdx'

export const Route = createFileRoute('/docs/dev/notifications')({
  component: () => <Content />,
})
