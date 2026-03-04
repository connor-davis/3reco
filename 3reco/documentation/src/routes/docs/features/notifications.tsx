import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/notifications.mdx'

export const Route = createFileRoute('/docs/features/notifications')({
  component: () => <Content />,
})
