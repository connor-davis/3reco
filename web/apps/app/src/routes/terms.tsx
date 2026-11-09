import { createFileRoute } from '@tanstack/react-router';
import { NoticePage } from '@/components/notice-page';

export const Route = createFileRoute('/terms')({
  component: () => <NoticePage title="Terms of use" part="terms" />,
});
