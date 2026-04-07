import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod/v4';
import { BankDetailsFields } from '../profile/bank-details-fields';
import { Button } from '../ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '../ui/field';
import { Input } from '../ui/input';
import { Tabs, TabsContent } from '../ui/tabs';

import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Spinner } from '../ui/spinner';
import { ConvexError } from 'convex/values';
import {
  bankDetailsFormSchema,
  type BankDetailsFormInputValues,
  type BankDetailsFormValues,
  requiredBankDetailsFormSchema,
} from '@/lib/bank-details';
import { cn } from '@/lib/utils';

const basicInfoFormSchema = z.object({
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

const businessInfoFormSchema = z.object({
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

const locationInfoFormSchema = z.object({
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

type ProfileTab = 'basicInfo' | 'businessInfo' | 'bankInfo' | 'locationInfo';

const profileSteps: Array<{
  value: ProfileTab;
  title: string;
  description: string;
}> = [
  {
    value: 'basicInfo',
    title: 'Basic info',
    description: 'Photo, contact details, and identity info.',
  },
  {
    value: 'businessInfo',
    title: 'Business',
    description: 'Business name and registration number.',
  },
  {
    value: 'bankInfo',
    title: 'Bank details',
    description: 'Payment details used for invoices and payouts.',
  },
  {
    value: 'locationInfo',
    title: 'Location',
    description: 'Address, city, postal code, and province.',
  },
];

export default function CompleteProfileGuard() {
  const router = useRouter();

  const { data: user, isLoading: isLoadingUser } = useSuspenseQuery({
    ...convexQuery(api.users.currentUser),
    retry: false,
  });

  const [tab, setTab] = useState<ProfileTab>('basicInfo');
  const [profileType, setProfileType] = useState<'business'>('business');

  const updateUser = useConvexMutation(api.users.update);

  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);
  const activeStepIndex = profileSteps.findIndex((step) => step.value === tab);

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();

      reader.addEventListener('load', () =>
        setImgSrc(reader.result?.toString() || '')
      );

      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const getCroppedImg = (image: HTMLImageElement, crop: PixelCrop): string => {
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );
    }

    return canvas.toDataURL('image/jpeg');
  };

  const basicInfoForm = useForm<z.infer<typeof basicInfoFormSchema>>({
    resolver: zodResolver(basicInfoFormSchema),
    defaultValues: {},
  });

  const businessInfoForm = useForm<z.infer<typeof businessInfoFormSchema>>({
    resolver: zodResolver(businessInfoFormSchema),
    defaultValues: {},
  });

  const locationInfoForm = useForm<z.infer<typeof locationInfoFormSchema>>({
    resolver: zodResolver(locationInfoFormSchema),
    defaultValues: {},
  });

  const bankInfoForm = useForm<
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

  const onCropComplete = (pixelCrop: PixelCrop) => {
    if (imgRef.current && pixelCrop.width && pixelCrop.height) {
      const base64 = getCroppedImg(imgRef.current, pixelCrop);
      basicInfoForm.setValue('image', base64);
    }
  };

  const submitBankInfo = (values: BankDetailsFormValues) => {
    const parsedValues =
      profileType === 'business'
        ? requiredBankDetailsFormSchema.safeParse(values)
        : bankDetailsFormSchema.safeParse(values);

    if (!parsedValues.success) {
      for (const issue of parsedValues.error.issues) {
        const fieldName = issue.path[0];

        if (typeof fieldName === 'string') {
          bankInfoForm.setError(fieldName as keyof BankDetailsFormInputValues, {
            message: issue.message,
          });
        }
      }

      return;
    }

    toast.promise(
      updateUser({
        _id: user._id,
        ...parsedValues.data,
      }),
      {
        loading: 'Updating your bank details...',
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
        success: () => {
          setTab('locationInfo');

          return 'Your bank details have been updated.';
        },
      }
    );
  };

  if (isLoadingUser)
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-4 text-foreground">
        <div className="flex items-center gap-3">
          <Spinner className="text-primary" />
          <Label className="text-muted-foreground">
            Loading user profile...
          </Label>
        </div>
      </div>
    );

  return (
    <Tabs value={tab} className="min-h-dvh w-full bg-background">
      <div className="flex min-h-dvh w-full flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">
                Step {activeStepIndex + 1} of {profileSteps.length}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Complete your profile
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Add the details we need to finish your profile.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {profileSteps.map((step, index) => {
                const isActive = step.value === tab;
                const isComplete = index < activeStepIndex;

                return (
                  <div
                    key={step.value}
                    className={cn(
                      'rounded-2xl border px-4 py-3 transition-colors',
                      isActive
                        ? 'border-primary/40 bg-primary/10'
                        : isComplete
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-border/70 bg-card'
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {step.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

      <TabsContent value="basicInfo">
        <div className="flex w-full flex-col">
          <form
            id="form-basic-info"
            onSubmit={basicInfoForm.handleSubmit(
              (values) =>
                toast.promise(
                  updateUser({
                    _id: user._id,
                    name: [values.firstName, values.lastName].join(' '),
                    ...values,
                  }),
                  {
                    loading: 'Updating your profile information...',
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
                    success: () => {
                      setProfileType('business');
                      setTab('businessInfo');

                      return 'Your profile has been updated.';
                    },
                  }
                ),
              console.log
            )}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-3xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
          >
            <FieldGroup className="gap-3">
              <Controller
                name="image"
                control={basicInfoForm.control}
                render={({ fieldState }) => {
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Profile Picture</FieldLabel>

                      {/* Hidden or styled input */}
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={onSelectFile}
                      />

                      {imgSrc && (
                        <div className="mt-4">
                          <ReactCrop
                            crop={crop}
                            onChange={(c) => setCrop(c)}
                            onComplete={onCropComplete}
                            aspect={1} // Square crop
                          >
                            <img ref={imgRef} src={imgSrc} alt="Crop me" />
                          </ReactCrop>
                        </div>
                      )}

                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}

                      <FieldDescription>Add a profile image, or leave it blank.</FieldDescription>
                    </Field>
                  );
                }}
              />

              <div className="grid md:grid-cols-2 gap-3">
                <Controller
                  name="firstName"
                  control={basicInfoForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-complete-profile-first-name">
                        First Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-complete-profile-first-name"
                        aria-invalid={fieldState.invalid}
                        placeholder="First Name"
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
                  control={basicInfoForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-complete-profile-last-name">
                        Last Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-complete-profile-last-name"
                        aria-invalid={fieldState.invalid}
                        placeholder="Last Name"
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
                control={basicInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-id-number">
                      ID Number
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-id-number"
                      aria-invalid={fieldState.invalid}
                      placeholder="ID Number"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                    <FieldDescription>South African ID number.</FieldDescription>
                  </Field>
                )}
              />

              <Controller
                name="phone"
                control={basicInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-phone">
                      Phone Number
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-phone"
                      aria-invalid={fieldState.invalid}
                      placeholder="Phone Number"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>

            <Button type="submit">Next</Button>
          </form>
        </div>
      </TabsContent>

      <TabsContent value="businessInfo">
        <div className="flex w-full flex-col">
          <form
            id="form-basic-info"
            onSubmit={businessInfoForm.handleSubmit(
              (values) =>
                toast.promise(
                  updateUser({
                    _id: user._id,
                    ...values,
                  }),
                  {
                    loading: 'Updating your profile information...',
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
                    success: () => {
                      setProfileType('business');
                      setTab('bankInfo');

                      return 'Your profile has been updated.';
                    },
                  }
                ),
              console.log
            )}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-3xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
          >
            <FieldGroup className="gap-3">
              <Controller
                name="businessName"
                control={businessInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-business-name">
                      Business Name
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-business-name"
                      aria-invalid={fieldState.invalid}
                      placeholder="Business Name"
                      autoComplete="name"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="businessRegistrationNumber"
                control={businessInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-business-registration-number">
                      Business Registration Number
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-business-registration-number"
                      aria-invalid={fieldState.invalid}
                      placeholder="Business Registration Number"
                      autoComplete="name"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>

            <div className="grid md:grid-cols-2 md:flex-row-reverse">
              <Button type="button" onClick={() => setTab('basicInfo')}>
                Previous
              </Button>
              <Button type="submit">Next</Button>
            </div>
          </form>
        </div>
      </TabsContent>

      <TabsContent value="bankInfo">
        <div className="flex w-full flex-col">
          <form
            id="form-bank-info"
            onSubmit={bankInfoForm.handleSubmit(submitBankInfo, console.log)}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-3xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
          >
            <BankDetailsFields
              control={bankInfoForm.control}
              idPrefix="complete-profile-bank-details"
              required={profileType === 'business'}
            />

            <div className="grid md:grid-cols-2 md:flex-row-reverse">
              <Button
                type="button"
                onClick={() => setTab('businessInfo')}
              >
                Previous
              </Button>
              <Button type="submit">Next</Button>
            </div>
          </form>
        </div>
      </TabsContent>

      <TabsContent value="locationInfo">
        <div className="flex w-full flex-col">
          <form
            id="form-basic-info"
            onSubmit={locationInfoForm.handleSubmit(
              (values) =>
                toast.promise(
                  updateUser({
                    _id: user._id,
                    profileComplete: true,
                    ...values,
                  }),
                  {
                    loading: 'Updating your profile information...',
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
                    success: () => {
                      router.navigate({
                        to: '/',
                        reloadDocument: true,
                        replace: true,
                      });

                      return 'Your profile has been updated.';
                    },
                  }
                ),
              console.log
            )}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-3xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
          >
            <FieldGroup className="gap-3">
              <Controller
                name="streetAddress"
                control={locationInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-street-address">
                      Street Address
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-street-address"
                      aria-invalid={fieldState.invalid}
                      placeholder="Street Address"
                      autoComplete="street-address"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="city"
                control={locationInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-city">
                      City
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-city"
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
                control={locationInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-area-code">
                      Area/Postal Code
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-complete-profile-area-code"
                      type="number"
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                      aria-invalid={fieldState.invalid}
                      placeholder="Area/Postal Code"
                      autoComplete="postal-code"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="province"
                control={locationInfoForm.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-complete-profile-street-address">
                      Province
                    </FieldLabel>
                    <Select
                      id="form-complete-profile-street-address"
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

            <div className="grid md:grid-cols-2 md:flex-row-reverse">
              <Button type="button" onClick={() => setTab('bankInfo')}>
                Previous
              </Button>
              <Button type="submit">Complete Profile</Button>
            </div>
          </form>
        </div>
      </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}
