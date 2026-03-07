import { useRouter } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAuthActions } from '@convex-dev/auth/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod/v4';
import { ConvexError } from 'convex/values';

// Helper function to convert phone number to email format
// Normalizes South African phone numbers to format: phone@3reco.co.za
function phoneToEmail(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Normalize to international format (remove leading 0, add 27)
  let normalized = digits;
  if (digits.startsWith('0')) {
    normalized = '27' + digits.slice(1);
  } else if (!digits.startsWith('27')) {
    normalized = '27' + digits;
  }

  return `${normalized}@3reco.co.za`;
}

const formSchema = z.object({
  email: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^(0\d{9}|\+27\d{9})$/).optional(),
  password: z.string().min(8).optional(),
}).refine((data) => data.email || data.phone, {
  message: 'Either email or phone number is required',
  path: ['email'],
});

export default function AuthenticationGuard() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [tab, setTab] = useState<'signIn' | 'signUp'>('signIn');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      phone: '',
      password: '',
    },
  });

  return (
    <Tabs value={tab} className="flex flex-col w-screen h-screen bg-background">
      <TabsContent value="signIn">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign In</CardTitle>
              <CardDescription>
                Please use your existing email and password to sign in to the
                application.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-in"
                onSubmit={form.handleSubmit(async (values) => {
                  if (!values.password)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter a valid password...',
                      duration: 2000,
                    });

                  if (!values.email && !values.phone)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter either an email or phone number...',
                      duration: 2000,
                    });

                  // Determine the email to use - either provided or converted from phone
                  const authEmail = values.email || (values.phone ? phoneToEmail(values.phone) : '');

                  const formData = new FormData();
                  formData.append('email', authEmail);
                  formData.append('password', values.password);
                  formData.append('flow', 'signIn');

                  // Store the original phone number for later use if provided
                  if (values.phone) {
                    formData.append('phone', values.phone);
                  }

                  signIn('password', formData)
                    .then(() => router.navigate({ to: '/' }))
                    .catch((error) => {
                      if (error instanceof ConvexError) {
                        return toast.error(error.data.name, {
                          description: error.data.message,
                          duration: 2000,
                        });
                      }

                      return toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    });
                })}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-in-email">
                          Email
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-in-email"
                          aria-invalid={fieldState.invalid}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <div className="text-center text-sm text-muted-foreground">
                    or
                  </div>

                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-in-phone">
                          Phone Number
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-in-phone"
                          aria-invalid={fieldState.invalid}
                          placeholder="+27 or 0..."
                          autoComplete="tel"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your South African phone number.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="password"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-in-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-in-password"
                          aria-invalid={fieldState.invalid}
                          placeholder="Password"
                          type="password"
                          autoComplete="current-password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your password.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit">Sign In</Button>
              </form>

              <p>
                Don't have an account?{' '}
                <span
                  className="text-primary cursor-pointer"
                  onClick={() => setTab('signUp')}
                >
                  Sign Up
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      <TabsContent value="signUp">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <Card className="max-w-96 w-full gap-10">
            <CardHeader>
              <CardTitle className="text-center">Sign Up</CardTitle>
              <CardDescription>
                Please enter your email address and password below to create a
                new account.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col w-full h-auto gap-10">
              <form
                id="form-sign-up"
                onSubmit={form.handleSubmit(async (values) => {
                  if (!values.password)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter a valid password...',
                      duration: 2000,
                    });

                  if (!values.email && !values.phone)
                    return toast.error('Uh Oh!', {
                      description: 'Please enter either an email or phone number...',
                      duration: 2000,
                    });

                  // Determine the email to use - either provided or converted from phone
                  const authEmail = values.email || (values.phone ? phoneToEmail(values.phone) : '');

                  const signUpData = {
                    flow: 'signUp' as const,
                    email: authEmail,
                    password: values.password,
                    agreedToTerms: false,
                    profileComplete: false,
                    ...(values.phone ? { phone: values.phone } : {}),
                  };

                  signIn('password', signUpData)
                    .then(() => router.navigate({ to: '/' }))
                    .catch((error) => {
                      if (error instanceof ConvexError) {
                        return toast.error(error.data.name, {
                          description: error.data.message,
                          duration: 2000,
                        });
                      }

                      return toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    });
                })}
                className="flex flex-col w-full h-auto gap-5"
              >
                <FieldGroup>
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-up-email">
                          Email
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-up-email"
                          aria-invalid={fieldState.invalid}
                          placeholder="Email"
                          autoComplete="email"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your email address.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <div className="text-center text-sm text-muted-foreground">
                    or
                  </div>

                  <Controller
                    name="phone"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-up-phone">
                          Phone Number
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-up-phone"
                          aria-invalid={fieldState.invalid}
                          placeholder="+27 or 0..."
                          autoComplete="tel"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your South African phone number.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="password"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="form-sign-up-password">
                          Password
                        </FieldLabel>
                        <Input
                          {...field}
                          id="form-sign-up-password"
                          aria-invalid={fieldState.invalid}
                          placeholder="Password"
                          type="password"
                          autoComplete="current-password"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                        <FieldDescription>
                          Please enter your password.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit">Sign Up</Button>
              </form>

              <p>
                Already have an account?{' '}
                <span
                  className="text-primary cursor-pointer"
                  onClick={() => setTab('signIn')}
                >
                  Sign In
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
