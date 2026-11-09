import { createFileRoute, redirect } from '@tanstack/react-router';

// Old notifications and links still reach the single Messages chat reader.
export const Route = createFileRoute('/market/$requestId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/messages/$requestId',
      params: { requestId: params.requestId },
      replace: true,
    });
  },
});
