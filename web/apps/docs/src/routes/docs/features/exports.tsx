import { createFileRoute } from '@tanstack/react-router'
import Content from '@/content/features/exports.mdx'

export const Route = createFileRoute('/docs/features/exports')({
  component: () => <Content />,
})
