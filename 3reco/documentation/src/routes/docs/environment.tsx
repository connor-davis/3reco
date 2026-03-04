import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/environment.mdx'

export const Route = createFileRoute('/docs/environment')({
  component: () => <Content />,
})
