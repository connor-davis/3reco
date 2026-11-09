import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/roles/admin.mdx'

export const Route = createFileRoute('/docs/roles/admin')({
  component: () => <Content />,
})
