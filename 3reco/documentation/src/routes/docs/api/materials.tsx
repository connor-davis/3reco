import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/api/materials.mdx'

export const Route = createFileRoute('/docs/api/materials')({
  component: () => <Content />,
})
