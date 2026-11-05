import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectField, TextField } from '@/components/form-fields';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { banks, provinces } from '@/lib/data/people';
import { useMock, useProfile } from '@/lib/mock/hooks';
import {
  bankSchema,
  businessSchema,
  locationSchema,
  personalSchema,
} from '@/routes/profile/-components/schemas';

// The same rules the profile forms use, so a wizard answer is always a valid
// profile answer.
const rules = {
  ...personalSchema.shape,
  ...businessSchema.shape,
  ...bankSchema.shape,
  ...locationSchema.shape,
};

type Field =
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'businessName'
  | 'bank'
  | 'accountNumber'
  | 'street'
  | 'province';

type Values = Record<Field, string>;
type Step = { title: string; fields: Field[] };

const businessSteps: Step[] = [
  { title: 'Basic details', fields: ['firstName', 'lastName', 'phone'] },
  { title: 'Business details', fields: ['businessName'] },
  { title: 'Bank & payout', fields: ['bank', 'accountNumber'] },
  { title: 'Location', fields: ['street', 'province'] },
];

// Collectors have no business, so they skip that step and its rules.
const collectorSteps = businessSteps.filter(
  (step) => step.title !== 'Business details'
);

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** "Finish your profile". It cannot be dismissed until the last step. */
export function ProfileWizard({ open, onOpenChange }: Props) {
  const { role } = useMock();

  // Keyed by role so a role change starts a fresh form with the right rules.
  return (
    <WizardBody
      key={role}
      steps={role === 'collector' ? collectorSteps : businessSteps}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

type BodyProps = Props & { steps: Step[] };

function WizardBody({ steps, open, onOpenChange }: BodyProps) {
  const { save } = useProfile();
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const fields = steps.flatMap((item) => item.fields);

  // Only the fields this role can see are validated and given a default.
  const schema = z.object(
    Object.fromEntries(fields.map((field) => [field, rules[field]]))
  );
  const { control, trigger, handleSubmit, reset } = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: Object.fromEntries(
      fields.map((field) => [field, ''])
    ) as Values,
  });

  async function next() {
    if (!(await trigger(step.fields))) return;
    setIndex(index + 1);
  }

  function finish(values: Values) {
    save(values);
    toast.success('Profile complete. Welcome aboard.');
    setIndex(0);
    reset();
    onOpenChange(false);
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      locked
      title="Finish your profile"
      description={`Step ${index + 1} of ${steps.length}: ${step.title}`}
      footer={
        <>
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Previous
          </Button>
          {last ? (
            <Button onClick={handleSubmit(finish)}>Complete</Button>
          ) : (
            <Button onClick={next}>Next</Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Progress
          value={((index + 1) / steps.length) * 100}
          aria-label="Profile progress"
        />
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => event.preventDefault()}
        >
          {step.fields.includes('firstName') && (
            <>
              <TextField
                control={control}
                name="firstName"
                label="First name"
              />
              <TextField control={control} name="lastName" label="Last name" />
              <TextField
                control={control}
                name="phone"
                label="Phone number"
                type="tel"
              />
            </>
          )}
          {step.fields.includes('businessName') && (
            <TextField
              control={control}
              name="businessName"
              label="Business name"
            />
          )}
          {step.fields.includes('bank') && (
            <>
              <SelectField
                control={control}
                name="bank"
                label="Bank"
                options={banks}
              />
              <TextField
                control={control}
                name="accountNumber"
                label="Account number"
                inputMode="numeric"
              />
            </>
          )}
          {step.fields.includes('street') && (
            <>
              <TextField
                control={control}
                name="street"
                label="Street address"
              />
              <SelectField
                control={control}
                name="province"
                label="Province"
                options={provinces}
              />
            </>
          )}
        </form>
      </div>
    </ResponsiveOverlay>
  );
}
