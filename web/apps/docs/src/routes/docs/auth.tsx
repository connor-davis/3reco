import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/auth.mdx'

export const Route = createFileRoute('/docs/auth')({
  component: () => <Content />,
})
