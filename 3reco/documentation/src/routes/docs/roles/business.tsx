import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/roles/business.mdx'

export const Route = createFileRoute('/docs/roles/business')({
  component: () => <Content />,
})
