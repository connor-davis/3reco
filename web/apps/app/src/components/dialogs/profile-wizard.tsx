import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { DataState } from '@/components/data-state';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useProfile, useUpdateProfile } from '@/lib/api/profile';
import {
  PersonalForm,
  BusinessForm,
  PayoutForm,
  LocationForm,
} from '@/routes/profile/-components/forms';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ProfileWizard({ open, onOpenChange }: Props) {
  return open ? <WizardBody onOpenChange={onOpenChange} /> : null;
}

function WizardBody({ onOpenChange }: Omit<Props, 'open'>) {
  const query = useProfile();
  const save = useUpdateProfile();
  const [index, setIndex] = useState(0);
  const profile = query.data;
  const steps =
    profile?.role === 'business'
      ? ['Personal', 'Business', 'Bank', 'Location']
      : ['Personal', 'Location'];
  const step = steps[index];

  async function next() {
    if (index < steps.length - 1) setIndex(index + 1);
    else {
      await save.mutateAsync({ profile_complete: true });
      toast.success('Profile complete.');
      onOpenChange(false);
    }
  }

  return (
    <ResponsiveOverlay
      open
      onOpenChange={onOpenChange}
      title="Finish your profile"
      description={'Step ' + (index + 1) + ' of ' + steps.length + ': ' + step}
      footer={
        <Button
          className="min-h-11"
          variant="outline"
          disabled={index === 0 || save.isPending}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </Button>
      }
    >
      <DataState
        query={query}
        isEmpty={!profile}
        icon={UserRound}
        emptyTitle="No profile yet"
        emptyText="Sign in to set up your profile."
      >
        <Progress
          value={((index + 1) / steps.length) * 100}
          aria-label="Profile progress"
          className="mb-4"
        />
        {profile && (
          <>
            {step === 'Personal' && (
              <PersonalForm profile={profile} onSaved={next} />
            )}
            {step === 'Business' && (
              <BusinessForm profile={profile} onSaved={next} />
            )}
            {step === 'Bank' && <PayoutForm profile={profile} onSaved={next} />}
            {step === 'Location' && (
              <LocationForm profile={profile} onSaved={next} />
            )}
          </>
        )}
      </DataState>
    </ResponsiveOverlay>
  );
}
