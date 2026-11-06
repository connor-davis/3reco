import { useState } from 'react';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Building2, Truck, UserRound, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth-shell';
import { DataState } from '@/components/data-state';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSignOut } from '@/lib/api/auth';
import { useFinishSetup, useProfile } from '@/lib/api/profile';
import { isStaffRole } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import {
  BusinessForm,
  LocationForm,
  PayoutForm,
  PersonalForm,
} from '@/routes/profile/-components/forms';

export const Route = createFileRoute('/setup')({ component: SetupPage });

type Choice = 'collector' | 'business';
type Step = 'type' | 'personal' | 'business' | 'bank' | 'location';

// The details each kind of account fills in, in order.
const detailSteps: Record<Choice, Step[]> = {
  business: ['personal', 'business', 'bank', 'location'],
  collector: ['personal', 'location', 'bank'],
};

const words: Record<Step, { title: string; text: string }> = {
  type: {
    title: 'How will you use 3REco?',
    text: 'Pick the one that fits you best. Only an admin can change it later.',
  },
  personal: {
    title: 'About you',
    text: 'Your name and phone number. Your phone number links you to the sales made in your name.',
  },
  business: {
    title: 'About your business',
    text: 'The name and registration number your business trades under.',
  },
  bank: {
    title: 'Where we pay you',
    text: 'Your bank details. They stay private and only show on your invoices.',
  },
  location: {
    title: 'Where you are',
    text: 'Your street address, so buyers and sellers know your area.',
  },
};

const options: {
  value: Choice;
  icon: LucideIcon;
  name: string;
  text: string;
}[] = [
  {
    value: 'collector',
    icon: Truck,
    name: 'I collect materials',
    text: 'I pick up recyclables and sell them to businesses.',
  },
  {
    value: 'business',
    icon: Building2,
    name: 'I run a business',
    text: 'I buy or sell recyclable materials for my company.',
  },
];

function SetupPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Navigate to="/sign-in" replace />;

  const guest = !user.role || user.role === 'guest';

  // Staff are set up by 3REco, and a finished profile has nothing left to do.
  if (isStaffRole(user.role) || (!guest && user.profileComplete)) {
    return <Navigate to="/" replace />;
  }

  return <Wizard fixed={guest ? null : (user.role as Choice)} />;
}

/** `fixed` is the role someone already has; a guest picks theirs on step one. */
function Wizard({ fixed }: { fixed: Choice | null }) {
  const [chosen, setChosen] = useState<Choice | null>(fixed);
  const [index, setIndex] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const query = useProfile();
  const finish = useFinishSetup();
  const signOut = useSignOut();
  const profile = query.data;

  const steps: Step[] = [
    ...(fixed ? [] : (['type'] as Step[])),
    ...(chosen ? detailSteps[chosen] : []),
  ];
  const step = steps[index] ?? 'type';
  // Until a guest picks, the count assumes the shorter path.
  const total = chosen ? steps.length : detailSteps.collector.length + 1;

  async function next() {
    if (index < steps.length - 1) return setIndex(index + 1);
    setFailure(null);
    try {
      await finish.mutateAsync(fixed ? {} : { role: chosen! });
      toast.success('You are all set.');
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'Setup did not finish.'
      );
    }
  }

  return (
    <AuthShell
      title={words[step].title}
      description={words[step].text}
      feedback={failure ? { tone: 'error', text: failure } : null}
      footer={
        <>
          {index > 0 && (
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={finish.isPending}
              onClick={() => setIndex(index - 1)}
            >
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Step {index + 1} of {total}
        </p>
        <Progress
          value={((index + 1) / total) * 100}
          aria-label="Setup progress"
        />
      </div>
      {step === 'type' ? (
        <div className="grid gap-3" role="group" aria-label="Account type">
          {options.map(({ value, icon: Icon, name, text }) => (
            <button
              key={value}
              type="button"
              aria-pressed={chosen === value}
              onClick={() => {
                setChosen(value);
                setIndex(1);
              }}
              className="flex min-h-11 items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-primary"
            >
              <Icon className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <span className="space-y-1">
                <span className="block font-medium">{name}</span>
                <span className="block text-sm text-muted-foreground">
                  {text}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <DataState
          query={query}
          isEmpty={!profile}
          icon={UserRound}
          emptyTitle="No profile yet"
          emptyText="Sign in again to set up your profile."
        >
          {profile && (
            <div key={step}>
              {step === 'personal' && (
                <PersonalForm profile={profile} onSaved={next} wizard />
              )}
              {step === 'business' && (
                <BusinessForm profile={profile} onSaved={next} wizard />
              )}
              {step === 'bank' && (
                <PayoutForm profile={profile} onSaved={next} wizard />
              )}
              {step === 'location' && (
                <LocationForm profile={profile} onSaved={next} wizard />
              )}
            </div>
          )}
        </DataState>
      )}
    </AuthShell>
  );
}
