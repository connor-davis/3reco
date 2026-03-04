import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/dashboard.mdx'

export const Route = createFileRoute('/docs/features/dashboard')({
  component: () => <Content />,
})
