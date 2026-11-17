import { useRef, useState } from 'react';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { Building2, Truck, UserRound, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth-shell';
import { DataState } from '@/components/data-state';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSignOut } from '@/lib/api/auth';
import { useBusiness } from '@/lib/api/business';
import { useFinishSetup, useProfile } from '@/lib/api/profile';
import { isStaffRole } from '@/lib/access';
import { useAuth } from '@/lib/auth/use-auth';
import type { BusinessProfile, Profile } from '@/lib/api/types';
import {
  BusinessForm,
  LocationForm,
  PayoutForm,
  PersonalForm,
  type SetupForm,
} from '@/routes/profile/-components/forms';

export const Route = createFileRoute('/setup')({ component: SetupPage });

type Choice = 'collector' | 'business';
type Step = 'type' | 'about' | 'details';

// The details each kind of account fills in, in order.
const detailSteps: Record<Choice, Step[]> = {
  business: ['about', 'details'],
  collector: ['about', 'details'],
};

const words: Record<Step, { title: string; text: string }> = {
  type: {
    title: 'How will you use 3REco?',
    text: 'Pick the one that fits you best. Only an admin can change it later.',
  },
  about: {
    title: 'About you',
    text: 'Your name and phone number. Your phone number links you to the sales made in your name.',
  },
  details: {
    title: 'Your bank and address',
    text: 'Your bank details stay private and only show on your invoices. Your address helps buyers and sellers find your area.',
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

  // Keyed by role, so a live role change remounts it with the right flow.
  return (
    <Wizard
      key={guest ? 'guest' : user.role}
      fixed={guest ? null : (user.role as Choice)}
    />
  );
}

/** `fixed` is the role someone already has; a guest picks theirs on step one. */
function Wizard({ fixed }: { fixed: Choice | null }) {
  const [chosen, setChosen] = useState<Choice | null>(fixed);
  const [index, setIndex] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useProfile();
  const finish = useFinishSetup();
  const signOut = useSignOut();
  const profile = query.data;
  const companyQuery = useBusiness(chosen === 'business');
  const company = companyQuery.data;

  const steps: Step[] = [
    ...(fixed ? [] : (['type'] as Step[])),
    ...(chosen ? detailSteps[chosen] : []),
  ];
  const step = steps[index] ?? 'type';
  const detailIndex = index - (fixed ? 0 : 1);

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
      title={
        step === 'about' && chosen === 'business'
          ? 'You and your business'
          : words[step].title
      }
      description={words[step].text}
      feedback={failure ? { tone: 'error', text: failure } : null}
      footer={
        <>
          {index > 0 && (
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={saving || finish.isPending}
              onClick={() => setIndex(index - 1)}
            >
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={saving || signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </Button>
        </>
      }
    >
      {step !== 'type' && (
        <div className="sticky top-0 z-10 space-y-2 bg-background py-2">
          <p className="text-sm text-muted-foreground">
            Step {detailIndex + 1} of 2
          </p>
          <Progress
            value={((detailIndex + 1) / 2) * 100}
            aria-label="Setup progress"
          />
        </div>
      )}
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
          {profile &&
            (chosen === 'business' ? (
              <DataState
                query={companyQuery}
                isEmpty={!company}
                icon={Building2}
                emptyTitle="No business yet"
                emptyText="Try loading your business again."
              >
                {company && (
                  <SetupStep
                    key={step}
                    step={step}
                    profile={profile}
                    company={company}
                    onSaved={next}
                    saving={saving}
                    onSaving={setSaving}
                  />
                )}
              </DataState>
            ) : (
              <SetupStep
                key={step}
                step={step}
                profile={profile}
                onSaved={next}
                saving={saving}
                onSaving={setSaving}
              />
            ))}
        </DataState>
      )}
    </AuthShell>
  );
}

function SetupStep({
  step,
  profile,
  company,
  onSaved,
  saving,
  onSaving,
}: {
  step: Step;
  profile: Profile;
  company?: BusinessProfile;
  onSaved: () => Promise<void>;
  saving: boolean;
  onSaving: (saving: boolean) => void;
}) {
  const first = useRef<SetupForm>(null);
  const second = useRef<SetupForm>(null);
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      // Validate every section before saving any of this screen.
      if (!(await first.current?.validate())) return;
      if (second.current && !(await second.current.validate())) return;
      onSaving(true);
      if (!(await first.current?.save())) return;
      if (second.current && !(await second.current.save())) return;
      await onSaved();
    } finally {
      submitting.current = false;
      onSaving(false);
    }
  }

  const firstGroup = { ref: first, onSubmit: () => void submit() };
  const secondGroup = { ref: second, onSubmit: () => void submit() };
  const details = company ?? profile;
  const bank = (
    <section className="min-w-0 space-y-4" aria-label="Bank details">
      <h2 className="font-semibold">Bank details</h2>
      <PayoutForm
        profile={details}
        business={!!company}
        wizard
        group={company ? firstGroup : secondGroup}
      />
    </section>
  );
  const location = (
    <section className="min-w-0 space-y-4" aria-label="Address">
      <h2 className="font-semibold">Address</h2>
      <LocationForm
        profile={details}
        business={!!company}
        wizard
        group={company ? secondGroup : firstGroup}
      />
    </section>
  );

  return (
    <div className="min-w-0 space-y-6">
      <fieldset disabled={saving} className="min-w-0 space-y-6">
        {step === 'about' ? (
          <>
            <section
              className="min-w-0 space-y-4"
              aria-label="Personal details"
            >
              <h2 className="font-semibold">Personal details</h2>
              <PersonalForm profile={profile} wizard group={firstGroup} />
            </section>
            {company && (
              <section
                className="min-w-0 space-y-4"
                aria-label="Business details"
              >
                <h2 className="font-semibold">Business details</h2>
                <BusinessForm profile={company} wizard group={secondGroup} />
              </section>
            )}
          </>
        ) : company ? (
          <>
            {bank}
            {location}
          </>
        ) : (
          <>
            {location}
            {bank}
          </>
        )}
      </fieldset>
      <Button
        className="min-h-11 w-full"
        disabled={saving}
        onClick={() => void submit()}
      >
        {saving ? 'Saving…' : step === 'details' ? 'Finish setup' : 'Continue'}
      </Button>
    </div>
  );
}
