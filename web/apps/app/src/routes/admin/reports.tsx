import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Guarded } from '@/components/access-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataState } from '@/components/data-state';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { type RowAction } from '@/components/row-actions';
import { ButtonRow } from '@/components/button-row';
import { Button } from '@/components/ui/button';
import {
  useAdminReports,
  useResolveReport,
  useUnsuspend,
  type Report,
  type ReportAction,
} from '@/lib/api/reports';
import { formatDate } from '@/lib/format';

export const Route = createFileRoute('/admin/reports')({
  component: () => (
    <Guarded page="reports">
      <ReportsPage />
    </Guarded>
  ),
});

const actionLabels = {
  dismiss: 'Dismiss report',
  remove_listing: 'Remove listing',
  suspend: 'Suspend business',
  unsuspend: 'Unsuspend business',
};

function ordinal(count: number) {
  const lastTwo = count % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[count % 10] ?? 'th');
  return `${count}${suffix}`;
}

function ReportsPage() {
  const query = useAdminReports();
  const resolve = useResolveReport();
  const unsuspend = useUnsuspend();
  const [selected, setSelected] = useState<{
    report: Report;
    action: ReportAction | 'unsuspend';
  } | null>(null);
  const pending = resolve.isPending || unsuspend.isPending;

  function actions(report: Report): RowAction[] {
    const choices: (ReportAction | 'unsuspend')[] =
      report.status === 'open'
        ? [
            'dismiss',
            ...(report.target_kind === 'listing'
              ? ['remove_listing' as const]
              : []),
            'suspend',
          ]
        : [];
    if (report.suspended) choices.push('unsuspend');
    return choices.map((action) => ({
      label: actionLabels[action],
      destructive: action === 'suspend' || action === 'remove_listing',
      disabled: pending,
      onSelect: () => setSelected({ report, action }),
    }));
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Review reports privately. Open reports appear first."
      />
      <DataState
        query={query}
        isEmpty={!query.data?.items.length}
        icon={Flag}
        emptyTitle="No reports"
        emptyText="Reports from businesses will appear here."
      >
        <div className="space-y-4">
          {query.data?.items.map((report) => (
            <Panel
              key={report.id}
              title={
                report.status === 'open' ? 'Open report' : 'Reviewed report'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2 break-words">
                  <p>
                    {report.reason.replaceAll('_', ' ')} ·{' '}
                    {formatDate(report.created_at)}
                  </p>
                  <p className="font-medium">{report.target_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Reported by {report.reporter_name}
                  </p>
                  {report.party_report_count > 1 && (
                    <p className="text-sm text-muted-foreground">
                      {ordinal(report.party_report_count)} report on this
                      business
                    </p>
                  )}
                  {report.target_kind === 'listing' && (
                    <p className="text-sm text-muted-foreground">
                      Listed by {report.party_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">
                    {report.details || 'No details added.'}
                  </p>
                  {report.suspended && (
                    <p className="text-sm text-destructive">
                      Business suspended
                    </p>
                  )}
                </div>
              </div>
              <ButtonRow className="mt-4 flex-wrap">
                {actions(report).map((action) => (
                  <Button
                    key={action.label}
                    variant={action.destructive ? 'destructive' : 'outline'}
                    disabled={action.disabled}
                    onClick={action.onSelect}
                  >
                    {action.label}
                  </Button>
                ))}
              </ButtonRow>
            </Panel>
          ))}
        </div>
      </DataState>
      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={`${selected ? actionLabels[selected.action] : 'Review report'}?`}
        description={
          selected?.action === 'unsuspend'
            ? 'This business can contact other businesses again. Existing blocks still apply.'
            : selected?.action === 'suspend'
              ? 'This business will be hidden and cannot send messages, offers or requests. Its team can still sign in and read old trades.'
              : selected?.action === 'remove_listing'
                ? 'The listing will be taken off the market.'
                : 'Close this report. The reporter will receive a generic thank-you message.'
        }
        confirmLabel={selected ? actionLabels[selected.action] : 'Confirm'}
        pending={pending}
        destructive={
          selected?.action === 'suspend' ||
          selected?.action === 'remove_listing'
        }
        onConfirm={() => {
          if (!selected) return;
          const options = {
            onSuccess: () => {
              setSelected(null);
              toast.success('Review saved.');
            },
            onError: (error: Error) => toast.error(error.message),
          };
          if (selected.action === 'unsuspend')
            unsuspend.mutate(selected.report.party_id, options);
          else
            resolve.mutate(
              { id: selected.report.id, action: selected.action },
              options
            );
        }}
      />
    </>
  );
}
