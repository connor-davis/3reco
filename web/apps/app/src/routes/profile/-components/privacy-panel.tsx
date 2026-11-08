import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { DataState } from '@/components/data-state';
import { TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import {
  usePrivacyNotice,
  useAcceptPrivacyNotice,
  useDownloadMyData,
  useDeleteAccount,
} from '@/lib/api/privacy';

const schema = z.object({
  password: z.string().min(1, 'Enter your password.'),
  confirmation: z
    .string()
    .refine((value): boolean => value === 'DELETE', 'Type DELETE to confirm.'),
});

export function PrivacyPanel() {
  const notice = usePrivacyNotice();
  const accept = useAcceptPrivacyNotice();
  const download = useDownloadMyData();
  const erase = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmation: '' },
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="font-medium">Privacy notice</h3>
        <DataState
          query={notice}
          icon={ShieldCheck}
          emptyTitle="No privacy notice"
          emptyText="Try again later."
          isEmpty={!notice.data}
        >
          <p className="text-sm text-muted-foreground">
            We use your account, profile and trade details to run the
            marketplace. Trade records are kept for five years, then anonymised.
            Notifications and carts are kept for 90 days. Privacy event records
            are kept for two years.
          </p>
          <p className="text-sm">
            Notice version: {notice.data?.version}.{' '}
            {notice.data?.accepted
              ? 'You have accepted this version.'
              : 'Please accept the current notice.'}
          </p>
          {!notice.data?.accepted && (
            <Button
              className="min-h-11"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: () => toast.success('Privacy notice accepted.'),
                })
              }
            >
              {accept.isPending ? 'Accepting…' : 'Accept notice'}
            </Button>
          )}
          {accept.isError && (
            <p role="alert" className="text-sm text-destructive">
              {accept.error.message} Try accepting again.
            </p>
          )}
        </DataState>
      </section>
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Download your profile, trades, messages and other account records as a
          JSON file.
        </p>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          {download.isPending ? 'Preparing download…' : 'Download'}
        </Button>
        {download.isError && (
          <p role="alert" className="text-sm text-destructive">
            {download.error.message} Try downloading again.
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="font-medium">Delete my account</h3>
        <p className="text-sm text-muted-foreground">
          Your account and profile will be removed, open requests cancelled, and
          you will be signed out. Trade records stay because they must be kept
          by law, with your personal details removed. This cannot be undone.
        </p>
        <Button
          className="min-h-11"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </Button>
      </section>
      <ResponsiveOverlay
        open={open}
        onOpenChange={(next) => {
          if (!erase.isPending) {
            setOpen(next);
            form.reset();
            erase.reset();
          }
        }}
        title="Delete your account?"
        description="Your account and personal details will be removed. Trade records stay because they must be kept by law, with your personal details removed. Re-enter your password and type DELETE to confirm. This cannot be undone."
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(async ({ password }) => {
            try {
              await erase.mutateAsync(password);
              form.reset();
              setOpen(false);
              toast.success('Your account has been deleted.');
            } catch (error) {
              form.setError('root', {
                message:
                  error instanceof Error
                    ? error.message
                    : 'Your account could not be deleted. Try again.',
              });
            }
          })}
        >
          <TextField
            control={form.control}
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            disabled={erase.isPending}
          />
          <TextField
            control={form.control}
            name="confirmation"
            label="Type DELETE to confirm"
            autoComplete="off"
            disabled={erase.isPending}
          />
          {form.formState.errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              disabled={erase.isPending}
              onClick={() => {
                setOpen(false);
                form.reset();
                erase.reset();
              }}
            >
              Keep account
            </Button>
            <Button
              className="min-h-11"
              type="submit"
              variant="destructive"
              disabled={erase.isPending}
            >
              {erase.isPending ? 'Deleting…' : 'Delete my account'}
            </Button>
          </div>
        </form>
      </ResponsiveOverlay>
    </div>
  );
}
