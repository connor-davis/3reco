import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AuthShell } from './-components/auth-shell';

export const Route = createFileRoute('/auth/verify-email')({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);

  async function resend() {
    setSending(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSending(false);
    toast.success('Verification email sent. Check your inbox.');
  }

  return (
    <AuthShell
      title="Check your email."
      description="We sent a verification link to you@company.co.za."
      feedback={
        verified
          ? { tone: 'info', text: 'Email verified. You can now sign in.' }
          : null
      }
      footer={
        <p>
          <Link to="/auth/sign-in" className="underline">
            Return to sign in
          </Link>
        </p>
      }
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MailCheck className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm text-muted-foreground">
        Check your spam folder too.
      </p>
      <div className="space-y-3">
        <Button className="w-full" disabled={sending} onClick={resend}>
          {sending ? (
            <>
              <Spinner data-icon="inline-start" /> Sending…
            </>
          ) : (
            'Resend verification email'
          )}
        </Button>
        {/* Preview only: stands in for clicking the link in the email. */}
        <Button
          className="w-full"
          variant="outline"
          onClick={() => setVerified(true)}
        >
          Simulate verified email
        </Button>
      </div>
    </AuthShell>
  );
}
