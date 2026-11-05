import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/dev/internal-actions.mdx'

export const Route = createFileRoute('/docs/dev/internal-actions')({
  component: () => <Content />,
})
