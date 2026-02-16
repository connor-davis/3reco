import { createFileRoute, useRouter } from '@tanstack/react-router';

import { useAuthActions } from '@convex-dev/auth/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod/v4';
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent } from '@/components/ui/tabs';

const formSchema = z.object({
  email: z.string().min(10).max(100),
  password: z.string().min(8).optional(),
});

export const Route = createFileRoute('/authentication')({
  errorComponent: (props) => <pre>{JSON.stringify(props, null, 2)}</pre>,
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();
  const { signIn } = useAuthActions();

  const [tab, setTab] = useState<'signIn' | 'signUp'>('signIn');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  return (
    <Tabs value={tab} className="flex flex-col w-screen h-screen">
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

                  const formData = new FormData();

                  formData.append('email', values.email);
                  formData.append('password', values.password);
                  formData.append('flow', 'signIn');

                  try {
                    await signIn('password', formData); // The Convex Auth provider name
                    // Redirect or update UI on success
                    router.navigate({ to: '/' });
                  } catch (error) {
                    if (error instanceof Error) {
                      if (error.message.includes('InvalidAccountId')) {
                        return toast.error('Uh Oh!', {
                          description: 'That account was not found.',
                          duration: 2000,
                        });
                      }

                      // Access the error message and display it to the user
                      toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    }
                  }
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

                  try {
                    await signIn('password', {
                      flow: 'signUp',
                      ...values,
                      agreedToTerms: false,
                      profileComplete: false,
                    }); // The Convex Auth provider name
                    // Redirect or update UI on success
                    router.navigate({ to: '/' });
                  } catch (error) {
                    if (error instanceof Error) {
                      if (error.message.includes('InvalidAccountId')) {
                        return toast.error('Uh Oh!', {
                          description: 'That account was not found.',
                          duration: 2000,
                        });
                      }

                      // Access the error message and display it to the user
                      toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      });
                    }
                  }
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
