import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/introduction.mdx'

export const Route = createFileRoute('/docs/introduction')({
  component: () => <Content />,
})
