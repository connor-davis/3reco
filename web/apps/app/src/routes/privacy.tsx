import { createFileRoute } from '@tanstack/react-router';
import { NoticePage } from '@/components/notice-page';

export const Route = createFileRoute('/privacy')({
  component: () => <NoticePage title="Privacy notice" part="privacy" />,
});
