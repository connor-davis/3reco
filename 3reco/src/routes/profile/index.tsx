import AvatarCropper from '@/components/dialogs/avatar-cropper';
import { BankDetailsFields } from '@/components/profile/bank-details-fields';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressLabel,
} from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  bankDetailsFormSchema,
  type BankDetailsFormInputValues,
  type BankDetailsFormValues,
  requiredBankDetailsFormSchema,
} from '@/lib/bank-details';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import {
  BriefcaseBusinessIcon,
  CheckCircle2Icon,
  CalendarIcon,
  GlobeIcon,
  LaptopMinimalIcon,
  LogOutIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  TrendingUpIcon,
  UsersIcon,
} from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod/v4';
import { authClient } from '@/lib/auth-client';
import {
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
  useQueryClient,
} from '@tanstack/react-query';

export const Route = createFileRoute('/profile/')({
  component: RouteComponent,
});

const profileFormSchema = z.object({
  image: z.string().optional(),
  firstName: z.string({
    error: 'Please provide your first name.',
  }),
  lastName: z.string({
    error: 'Please provide your last name.',
  }),
  idNumber: z
    .string({
      error: 'Please provide your ID Number',
    })
    .regex(
      /^\d{13}$/g,
      'Please provide a valid 13 digit South African ID Number.'
    ),
  phone: z
    .string({
      error: 'Please provide your phone number.',
    })
    .regex(
      /^(0\d{9}|\+27\d{9})$/g,
      'Invalid South African phone number format (+27 or 0...)'
    ),
});

const businessProfileFormSchema = z.object({
  businessName: z.string({ error: 'Please provide your business name.' }),
  businessRegistrationNumber: z
    .string({
      error: 'Please provide your business registration number.',
    })
    .regex(
      /^\d{4}\/\d{6}\/\d{2}$/,
      'Invalid South African business registration format (YYYY/NNNNNN/SS)'
    ),
});

const locationFormSchema = z.object({
  streetAddress: z.string({ error: 'Please provide your street address.' }),
  city: z.string({ error: 'Please provide your city.' }),
  areaCode: z.number({ error: 'Please provide your area/postal code.' }),
  province: z.enum(
    [
      'Eastern Cape',
      'Free State',
      'Gauteng',
      'KwaZulu-Natal',
      'Limpopo',
      'Mpumalanga',
      'Northern Cape',
      'North West',
      'Western Cape',
    ],
    { error: 'Please provide your province.' }
  ),
});

function formatJoinedDate(timestamp?: number) {
  if (!timestamp) {
    return 'Recently joined';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function buildDisplayName(user: ReturnType<typeof useConvexQuery<typeof api.users.currentUser>>) {
  if (!user) return '';

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

  return fullName || user.businessName || user.name || user.email || 'Profile';
}

type BetterAuthSession = {
  id: string;
  token: string;
  userId: string;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type BetterAuthSessionResult =
  | BetterAuthSession[]
  | { data?: BetterAuthSession[] | null }
  | null
  | undefined;

type BetterAuthDeviceSession = {
  session: BetterAuthSession;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
};

type BetterAuthDeviceSessionResult =
  | BetterAuthDeviceSession[]
  | { data?: BetterAuthDeviceSession[] | null }
  | null
  | undefined;

function normalizeBetterAuthSessions(result: BetterAuthSessionResult) {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.data ?? [];
}

function normalizeBetterAuthDeviceSessions(result: BetterAuthDeviceSessionResult) {
  if (Array.isArray(result)) {
    return result;
  }

  return result?.data ?? [];
}

function formatSessionExpiry(expiresAt: BetterAuthSession['expiresAt']) {
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown expiry';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatSessionDevice(session: BetterAuthSession) {
  const agent = session.userAgent?.trim();

  if (!agent) {
    return 'Browser session';
  }

  if (/iphone|ipad|android|mobile/i.test(agent)) {
    return 'Mobile browser';
  }

  if (/windows|macintosh|linux|x11/i.test(agent)) {
    return 'Desktop browser';
  }

  return 'Browser session';
}

function RouteComponent() {
  const user = useConvexQuery(api.users.currentUser);
  const saveProfile = useConvexMutation(api.users.update);
  const queryClient = useQueryClient();
  const sessionState = authClient.useSession();
  const sessionsQuery = useTanstackQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => authClient.listSessions(),
  });
  const deviceSessionsQuery = useTanstackQuery({
    queryKey: ['auth', 'device-sessions'],
    queryFn: () => authClient.multiSession.listDeviceSessions(),
  });
  const switchSessionMutation = useTanstackMutation({
    mutationFn: async (sessionToken: string) => {
      await authClient.multiSession.setActive({
        sessionToken,
      });
    },
  });
  const revokeSessionMutation = useTanstackMutation({
    mutationFn: async (sessionToken: string) => {
      await authClient.revokeSession({
        token: sessionToken,
      });
    },
  });
  const revokeOtherSessionsMutation = useTanstackMutation({
    mutationFn: async () => {
      await authClient.revokeOtherSessions();
    },
  });

  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: user?.firstName,
      lastName: user?.lastName,
      phone: user?.phone,
      image: user?.image,
      idNumber: user?.idNumber,
    },
  });

  const businessProfileForm = useForm<
    z.infer<typeof businessProfileFormSchema>
  >({
    resolver: zodResolver(businessProfileFormSchema),
    defaultValues: {
      businessName: user?.businessName,
      businessRegistrationNumber: user?.businessRegistrationNumber,
    },
  });

  const locationForm = useForm<z.infer<typeof locationFormSchema>>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      streetAddress: user?.streetAddress,
      city: user?.city,
      areaCode: user?.areaCode,
      province: user?.province,
    },
  });

  const bankDetailsForm = useForm<
    BankDetailsFormInputValues,
    undefined,
    BankDetailsFormValues
  >({
    resolver: zodResolver(bankDetailsFormSchema),
    defaultValues: {
      bankAccountHolderName: user?.bankAccountHolderName,
      bankName: user?.bankName,
      bankAccountNumber: user?.bankAccountNumber,
      bankBranchCode: user?.bankBranchCode,
      bankAccountType: user?.bankAccountType,
    },
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    profileForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      image: user.image,
      idNumber: user.idNumber,
    });

    businessProfileForm.reset({
      businessName: user.businessName,
      businessRegistrationNumber: user.businessRegistrationNumber,
    });

    locationForm.reset({
      streetAddress: user.streetAddress,
      city: user.city,
      areaCode: user.areaCode,
      province: user.province,
    });

    bankDetailsForm.reset({
      bankAccountHolderName: user.bankAccountHolderName,
      bankName: user.bankName,
      bankAccountNumber: user.bankAccountNumber,
      bankBranchCode: user.bankBranchCode,
      bankAccountType: user.bankAccountType,
    });
  }, [bankDetailsForm, businessProfileForm, locationForm, profileForm, user]);

  if (!user) return undefined;

  const refreshSessionState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['auth', 'device-sessions'] }),
      sessionState.refetch(),
    ]);
  };

  const displayName = buildDisplayName(user);
  const currentSessionId = sessionState.data?.session.id;
  const profileRole =
    user.type === 'business'
      ? 'Business account'
      : user.type === 'collector'
        ? 'Collector'
        : user.type === 'staff'
          ? 'Staff'
          : user.type === 'admin'
            ? 'Admin'
            : 'Member';
  const location = [user.city, user.province].filter(Boolean).join(', ') || 'South Africa';
  const memberSince = formatJoinedDate(user._creationTime);
  const completionScore = [
    user.image,
    user.firstName,
    user.lastName,
    user.phone,
    user.idNumber,
    user.businessName,
    user.streetAddress,
    user.bankName,
  ].filter(Boolean).length;
  const profileStrength = Math.round((completionScore / 8) * 100);

  const stats = [
    {
      label: 'Profile strength',
      value: `${profileStrength}%`,
      icon: TrendingUpIcon,
      tint: 'text-sky-400',
      bg: 'bg-sky-500/12',
    },
    {
      label: 'Saved details',
      value: `${[user.phone, user.idNumber, user.streetAddress, user.bankName].filter(Boolean).length}`,
      icon: SparklesIcon,
      tint: 'text-cyan-400',
      bg: 'bg-cyan-500/12',
    },
    {
      label: 'Status',
      value: user.profileComplete ? 'Ready' : 'Incomplete',
      icon: UsersIcon,
      tint: 'text-emerald-400',
      bg: 'bg-emerald-500/12',
    },
    {
      label: 'Member since',
      value: memberSince.split(' ').slice(-1)[0] ?? memberSince,
      icon: CalendarIcon,
      tint: 'text-violet-400',
      bg: 'bg-violet-500/12',
    },
  ];

  const setupChecks = [
    {
      label: 'Personal details',
      ready: Boolean(user.firstName && user.lastName && user.idNumber),
    },
    {
      label: 'Contact details',
      ready: Boolean(user.email && user.phone),
    },
    {
      label: 'Address',
      ready: Boolean(user.streetAddress && user.city && user.province),
    },
    {
      label: 'Payout details',
      ready: Boolean(user.bankName && user.bankAccountNumber && user.bankBranchCode),
    },
  ];
  const allSessions = normalizeBetterAuthSessions(sessionsQuery.data);
  const deviceSessions = normalizeBetterAuthDeviceSessions(deviceSessionsQuery.data);

  const submitBankDetails = (values: BankDetailsFormValues) => {
    const parsedValues =
      user.type === 'business'
        ? requiredBankDetailsFormSchema.safeParse(values)
        : bankDetailsFormSchema.safeParse(values);

    if (!parsedValues.success) {
      for (const issue of parsedValues.error.issues) {
        const fieldName = issue.path[0];

        if (typeof fieldName === 'string') {
          bankDetailsForm.setError(fieldName as keyof BankDetailsFormInputValues, {
            message: issue.message,
          });
        }
      }

      return;
    }

    toast.promise(
      saveProfile({
        _id: user._id,
        ...parsedValues.data,
      }),
      {
        loading: 'Saving your bank details...',
        error: (error: Error) => {
          if (error instanceof ConvexError) {
            return {
              message: error.data.name,
              description: error.data.message,
            };
          }

          return {
            message: error.name,
            description: error.message,
          };
        },
        success: () => 'Bank details saved successfully!',
      }
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto px-3 pb-6 pt-4 sm:px-4 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Profile
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              View and manage your profile information.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border-border/80 bg-card">
          <div className="h-40 w-full bg-[linear-gradient(135deg,hsl(200_89%_48%),hsl(196_78%_38%))]" />
          <CardContent className="-mt-16 flex flex-col gap-6 px-5 pb-5 sm:px-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Controller
                  name="image"
                  control={profileForm.control}
                  render={({ field, fieldState }) => (
                    <Dialog>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <div className="w-24 shrink-0 sm:w-28">
                              <DialogTrigger
                                render={
                                  <button
                                    type="button"
                                    className="block w-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                  />
                                }
                              >
                                <AspectRatio ratio={1 / 1} className="w-full">
                                  <Avatar className="h-full w-full border-[5px] border-card bg-primary/20 shadow-[var(--shadow-glass)]">
                                    <AvatarImage src={field.value} alt={displayName} />
                                    <AvatarFallback className="bg-primary text-3xl font-semibold text-primary-foreground sm:text-4xl">
                                      {displayName.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                </AspectRatio>
                              </DialogTrigger>
                            </div>
                          }
                        />
                        <TooltipContent>Update photo</TooltipContent>
                      </Tooltip>

                      <DialogContent>
                        <FieldGroup className="gap-3">
                          <AvatarCropper
                            src={field.value || ''}
                            onComplete={(dataUrl) => {
                              field.onChange(dataUrl);
                            }}
                          />
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel>Profile Photo</FieldLabel>
                            <Input
                              type="file"
                              accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    field.onChange(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <FieldDescription>
                              Choose a photo from your device. PNG, JPG, WEBP, and GIF files work best.
                            </FieldDescription>
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        </FieldGroup>
                      </DialogContent>
                    </Dialog>
                  )}
                />

                <div className="min-w-0 space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                    {displayName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{profileRole}</p>
                </div>
              </div>

            </div>

            <Separator className="bg-border/80" />

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-5">
              <div className="flex items-center gap-2">
                <MailIcon className="size-4 text-muted-foreground" />
                <span className="truncate">{user.email ?? 'No email set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-muted-foreground" />
                <span>{location}</span>
              </div>
              <div className="flex items-center gap-2">
                <PhoneIcon className="size-4 text-muted-foreground" />
                <span>{user.phone ?? 'Add phone number'}</span>
              </div>
              <div className="flex items-center gap-2">
                <GlobeIcon className="size-4 text-muted-foreground" />
                <span>3reco.app</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="size-4 text-muted-foreground" />
                <span>Joined {memberSince}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="gap-5">
          <TabsList variant="line" className="w-fit gap-6 p-0 text-sm">
            <TabsTrigger value="overview" className="px-0">
              Overview
            </TabsTrigger>
            <TabsTrigger value="details" className="px-0">
              Details
            </TabsTrigger>
            <TabsTrigger value="payouts" className="px-0">
              Payouts
            </TabsTrigger>
            <TabsTrigger value="sessions" className="px-0">
              Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                  <Card key={stat.label} className="border-border/80 bg-card">
                    <CardContent className="flex items-center gap-4 px-5 py-5">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.bg}`}>
                        <Icon className={`size-5 ${stat.tint}`} />
                      </div>
                      <div>
                        <div className="text-3xl font-semibold tracking-tight text-foreground">
                          {stat.value}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {stat.label}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
              <Card className="border-border/80 bg-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl font-semibold">Account summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-5">
                      <InfoRow
                        icon={BriefcaseBusinessIcon}
                        label="Account"
                        value={user.email ?? displayName}
                      />
                      <InfoRow
                        icon={MailIcon}
                        label="Email"
                        value={user.email ?? 'No email set'}
                      />
                      <InfoRow
                        icon={PhoneIcon}
                        label="Phone"
                        value={user.phone ?? 'No phone number'}
                      />
                    </div>
                    <div className="space-y-5">
                      <InfoRow
                        icon={MapPinIcon}
                        label="Location"
                        value={location}
                      />
                      <InfoRow
                        icon={CalendarIcon}
                        label="Member Since"
                        value={memberSince}
                      />
                      <InfoRow
                        icon={GlobeIcon}
                        label="Website"
                        value="3reco.app"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card">
                <CardHeader className="pb-4">
                  <CardTitle className="text-2xl font-semibold">
                    Setup status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {setupChecks.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-background/40 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      <Badge
                        variant={item.ready ? 'secondary' : 'outline'}
                        className={item.ready ? 'bg-emerald-500/12 text-emerald-400' : ''}
                      >
                        {item.ready ? 'Complete' : 'Pending'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border-border/80 bg-card">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    Personal Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={profileForm.handleSubmit((values) =>
                      toast.promise(
                        saveProfile({
                          _id: user._id,
                          firstName: values.firstName,
                          lastName: values.lastName,
                          phone: values.phone,
                          image: values.image,
                          idNumber: values.idNumber,
                          name: [
                            values.firstName?.trim(),
                            values.lastName?.trim(),
                          ].join(' '),
                        }),
                        {
                          loading: 'Saving your details...',
                          error: (error: Error) => {
                            if (error instanceof ConvexError) {
                              return {
                                message: error.data.name,
                                description: error.data.message,
                              };
                            }

                            return {
                              message: error.name,
                              description: error.message,
                            };
                          },
                          success: () => 'Your details have been saved.',
                        }
                      )
                    )}
                  >
                    <FieldGroup className="gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Controller
                          name="firstName"
                          control={profileForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="profile-first-name">
                                First name
                              </FieldLabel>
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                id="profile-first-name"
                                aria-invalid={fieldState.invalid}
                                placeholder="First name"
                                autoComplete="given-name"
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />

                        <Controller
                          name="lastName"
                          control={profileForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="profile-last-name">
                                Last name
                              </FieldLabel>
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                id="profile-last-name"
                                aria-invalid={fieldState.invalid}
                                placeholder="Last name"
                                autoComplete="family-name"
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />
                      </div>

                      <Controller
                        name="idNumber"
                        control={profileForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="profile-id-number">
                              ID number
                            </FieldLabel>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              id="profile-id-number"
                              aria-invalid={fieldState.invalid}
                              placeholder="ID number"
                            />
                            <FieldDescription>
                              Enter your South African ID number.
                            </FieldDescription>
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />

                      <Controller
                        name="phone"
                        control={profileForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="profile-phone">
                              Phone number
                            </FieldLabel>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              id="profile-phone"
                              aria-invalid={fieldState.invalid}
                              placeholder="Phone number"
                            />
                            <FieldDescription>
                              Enter the best number to reach you on.
                            </FieldDescription>
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                    </FieldGroup>

                    <Button type="submit" className="w-full sm:w-auto">
                      Save details
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={locationForm.handleSubmit((values) =>
                      toast.promise(
                        saveProfile({
                          _id: user._id,
                          streetAddress: values.streetAddress,
                          city: values.city,
                          areaCode: values.areaCode,
                          province: values.province,
                        }),
                        {
                          loading: 'Saving your address...',
                          error: (error: Error) => {
                            if (error instanceof ConvexError) {
                              return {
                                message: error.data.name,
                                description: error.data.message,
                              };
                            }

                            return {
                              message: error.name,
                              description: error.message,
                            };
                          },
                          success: () => 'Your address has been saved.',
                        }
                      )
                    )}
                  >
                    <FieldGroup className="gap-4">
                      <Controller
                        name="streetAddress"
                        control={locationForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="profile-street-address">
                              Street address
                            </FieldLabel>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              id="profile-street-address"
                              aria-invalid={fieldState.invalid}
                              placeholder="Street address"
                              autoComplete="street-address"
                            />
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <Controller
                          name="city"
                          control={locationForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="profile-city">City</FieldLabel>
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                id="profile-city"
                                aria-invalid={fieldState.invalid}
                                placeholder="City"
                                autoComplete="address-level2"
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />

                        <Controller
                          name="areaCode"
                          control={locationForm.control}
                          render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                              <FieldLabel htmlFor="profile-area-code">
                                Postal code
                              </FieldLabel>
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                id="profile-area-code"
                                type="number"
                                onChange={(event) =>
                                  field.onChange(
                                    Number.isNaN(event.target.valueAsNumber)
                                      ? undefined
                                      : event.target.valueAsNumber
                                  )
                                }
                                aria-invalid={fieldState.invalid}
                                placeholder="Postal code"
                                autoComplete="postal-code"
                              />
                              {fieldState.invalid && (
                                <FieldError errors={[fieldState.error]} />
                              )}
                            </Field>
                          )}
                        />
                      </div>

                      <Controller
                        name="province"
                        control={locationForm.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="profile-province">
                              Province
                            </FieldLabel>
                            <Select
                              id="profile-province"
                              value={field.value}
                              onValueChange={(value) => field.onChange(value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a province" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Provinces</SelectLabel>
                                  {[
                                    'Eastern Cape',
                                    'Free State',
                                    'Gauteng',
                                    'KwaZulu-Natal',
                                    'Limpopo',
                                    'Mpumalanga',
                                    'Northern Cape',
                                    'North West',
                                    'Western Cape',
                                  ].map((province) => (
                                    <SelectItem key={province} value={province}>
                                      {province}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {fieldState.invalid && (
                              <FieldError errors={[fieldState.error]} />
                            )}
                          </Field>
                        )}
                      />
                    </FieldGroup>

                    <Button type="submit" className="w-full sm:w-auto">
                      Save address
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <Card className="border-border/80 bg-card">
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    Bank Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={bankDetailsForm.handleSubmit(submitBankDetails)}
                  >
                    <BankDetailsFields
                      control={bankDetailsForm.control}
                      idPrefix="profile-bank-details"
                      required={user.type === 'business'}
                    />

                    <Button type="submit" className="w-full sm:w-auto">
                      Save payout details
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {user.type === 'business' ? (
                  <Card className="border-border/80 bg-card">
                    <CardHeader>
                      <CardTitle className="text-xl font-semibold">
                        Business Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form
                        className="flex flex-col gap-4"
                        onSubmit={businessProfileForm.handleSubmit((values) =>
                          toast.promise(
                            saveProfile({
                              _id: user._id,
                              businessName: values.businessName,
                              businessRegistrationNumber:
                                values.businessRegistrationNumber,
                            }),
                            {
                              loading: 'Saving your business details...',
                              error: (error: Error) => {
                                if (error instanceof ConvexError) {
                                  return {
                                    message: error.data.name,
                                    description: error.data.message,
                                  };
                                }

                                return {
                                  message: error.name,
                                  description: error.message,
                                };
                              },
                              success: () => 'Your business details have been saved.',
                            }
                          )
                        )}
                      >
                        <FieldGroup className="gap-4">
                          <Controller
                            name="businessName"
                            control={businessProfileForm.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="profile-business-name">
                                  Business name
                                </FieldLabel>
                                <Input
                                  {...field}
                                  value={field.value ?? ''}
                                  id="profile-business-name"
                                  aria-invalid={fieldState.invalid}
                                  placeholder="Business name"
                                  autoComplete="organization"
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />

                          <Controller
                            name="businessRegistrationNumber"
                            control={businessProfileForm.control}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="profile-business-registration-number">
                                  Business registration number
                                </FieldLabel>
                                <Input
                                  {...field}
                                  value={field.value ?? ''}
                                  id="profile-business-registration-number"
                                  aria-invalid={fieldState.invalid}
                                  placeholder="Business registration number"
                                />
                                {fieldState.invalid && (
                                  <FieldError errors={[fieldState.error]} />
                                )}
                              </Field>
                            )}
                          />
                        </FieldGroup>

                        <Button type="submit" className="w-full sm:w-auto">
                          Save business details
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-border/80 bg-card">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold">
                      Payout readiness
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Progress value={profileStrength} className="gap-2">
                      <div className="flex items-center gap-3">
                        <ProgressLabel className="text-sm font-semibold text-foreground">
                          Profile completion
                        </ProgressLabel>
                        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                          {profileStrength}%
                        </span>
                      </div>
                    </Progress>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Finish your contact, address, and bank details to keep payouts and account setup moving smoothly.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
              <Card className="border-border/80 bg-card">
                <CardHeader className="gap-1 pb-4">
                  <CardTitle className="text-xl font-semibold">
                    Active sessions
                  </CardTitle>
                  <CardDescription>
                    Review where you are signed in and revoke sessions you no longer trust.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sessionsQuery.isPending ? (
                    <p className="text-sm text-muted-foreground">
                      Loading your active sessions...
                    </p>
                  ) : allSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No active sessions were returned.
                    </p>
                  ) : (
                    allSessions.map((session) => {
                      const isCurrent = session.id === currentSessionId;

                      return (
                        <div
                          key={session.id}
                          className="space-y-3 rounded-2xl border border-border/70 bg-background/40 px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {formatSessionDevice(session)}
                                </span>
                                <Badge
                                  variant={isCurrent ? 'secondary' : 'outline'}
                                  className={
                                    isCurrent
                                      ? 'bg-emerald-500/12 text-emerald-400'
                                      : ''
                                  }
                                >
                                  {isCurrent ? 'Current session' : 'Active'}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {session.ipAddress
                                  ? `IP address: ${session.ipAddress}`
                                  : 'IP address unavailable'}
                              </div>
                              {session.userAgent ? (
                                <p className="break-words text-xs text-muted-foreground">
                                  {session.userAgent}
                                </p>
                              ) : null}
                            </div>

                            {!isCurrent ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toast.promise(
                                    revokeSessionMutation.mutateAsync(session.token).then(
                                      async () => {
                                        await refreshSessionState();
                                      }
                                    ),
                                    {
                                      loading: 'Signing out that session...',
                                      success: 'Session revoked.',
                                      error: (error: Error) => ({
                                        message: 'Unable to revoke session',
                                        description: error.message,
                                      }),
                                    }
                                  )
                                }
                              >
                                <Trash2Icon className="size-4" />
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  toast.promise(authClient.signOut(), {
                                    loading: 'Signing out...',
                                    success: 'Signed out.',
                                    error: (error: Error) => ({
                                      message: 'Unable to sign out',
                                      description: error.message,
                                    }),
                                  })
                                }
                              >
                                <LogOutIcon className="size-4" />
                                Sign out
                              </Button>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Expires {formatSessionExpiry(session.expiresAt)}
                          </p>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-border/80 bg-card">
                  <CardHeader className="gap-1 pb-4">
                    <CardTitle className="text-xl font-semibold">
                      Quick actions
                    </CardTitle>
                    <CardDescription>
                      Use Better Auth multi-session controls to secure or switch your session state.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      type="button"
                      className="w-full justify-start"
                      variant="outline"
                      disabled={revokeOtherSessionsMutation.isPending}
                      onClick={() =>
                        toast.promise(
                          revokeOtherSessionsMutation.mutateAsync().then(async () => {
                            await refreshSessionState();
                          }),
                          {
                            loading: 'Signing out other sessions...',
                            success: 'Other sessions revoked.',
                            error: (error: Error) => ({
                              message: 'Unable to revoke other sessions',
                              description: error.message,
                            }),
                          }
                        )
                      }
                    >
                      <ShieldCheckIcon className="size-4" />
                      Sign out other sessions
                    </Button>
                    <Button
                      type="button"
                      className="w-full justify-start"
                      variant="ghost"
                      disabled={sessionsQuery.isFetching || deviceSessionsQuery.isFetching}
                      onClick={() =>
                        toast.promise(refreshSessionState(), {
                          loading: 'Refreshing sessions...',
                          success: 'Sessions refreshed.',
                          error: (error: Error) => ({
                            message: 'Unable to refresh sessions',
                            description: error.message,
                          }),
                        })
                      }
                    >
                      <RefreshCwIcon className="size-4" />
                      Refresh sessions
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card">
                  <CardHeader className="gap-1 pb-4">
                    <CardTitle className="text-xl font-semibold">
                      Session switching
                    </CardTitle>
                    <CardDescription>
                      Switch the active session when this browser has more than one Better Auth session available.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {deviceSessionsQuery.isPending ? (
                      <p className="text-sm text-muted-foreground">
                        Loading switchable sessions...
                      </p>
                    ) : deviceSessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No extra sessions are available on this browser yet.
                      </p>
                    ) : (
                      deviceSessions.map((entry) => {
                        const session = entry.session;
                        const isCurrent = session.id === currentSessionId;
                        const sessionAccountLabel =
                          entry.user.name || entry.user.email || 'Saved account';

                        return (
                          <div
                            key={session.id}
                            className="space-y-3 rounded-2xl border border-border/70 bg-background/40 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <LaptopMinimalIcon className="size-4 text-muted-foreground" />
                                  <span className="font-medium text-foreground">
                                    {sessionAccountLabel}
                                  </span>
                                  {isCurrent ? (
                                    <Badge
                                      variant="secondary"
                                      className="bg-emerald-500/12 text-emerald-400"
                                    >
                                      Current
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatSessionDevice(session)} ·{' '}
                                  Expires {formatSessionExpiry(session.expiresAt)}
                                </p>
                              </div>

                              {!isCurrent ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    toast.promise(
                                      switchSessionMutation.mutateAsync(session.token).then(
                                        async () => {
                                          await refreshSessionState();
                                        }
                                      ),
                                      {
                                        loading: 'Switching session...',
                                        success: 'Session switched.',
                                        error: (error: Error) => ({
                                          message: 'Unable to switch sessions',
                                          description: error.message,
                                        }),
                                      }
                                    )
                                  }
                                >
                                  <CheckCircle2Icon className="size-4" />
                                  Switch here
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BriefcaseBusinessIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
