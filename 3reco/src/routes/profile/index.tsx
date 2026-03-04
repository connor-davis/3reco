import BackButton from '@/components/back-button';
import AvatarCropper from '@/components/dialogs/avatar-cropper';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';

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

function RouteComponent() {
  const user = useConvexQuery(api.users.currentUser);
  const saveProfile = useConvexMutation(api.users.update);

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

  if (!user) return undefined;

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Your Profile</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto"></div>
      </div>

      <div className="flex flex-col w-full h-full overflow-y-auto">
        <Accordion
          defaultValue={['profile-information']}
          multiple
          className="rounded-xl border"
        >
          <AccordionItem
            value="profile-information"
            className="border-b px-3 last:border-b-0"
          >
            <AccordionTrigger>Profile Information</AccordionTrigger>
            <AccordionContent>
              <form
                className="flex flex-col w-full gap-3 p-1"
                onSubmit={profileForm.handleSubmit((values) =>
                  toast.promise(
                    saveProfile({
                      _id: user?._id,
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
                      loading: 'Saving your profile information...',
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
                        profileForm.reset({});

                        return 'Profile information saved successfully!';
                      },
                    }
                  )
                )}
              >
                <FieldGroup className="gap-3">
                  <Controller
                    name="image"
                    control={profileForm.control}
                    render={({ fieldState, field }) => {
                      return (
                        <div className="flex items-center justify-center">
                          <Tooltip>
                            <Dialog>
                              <TooltipTrigger
                                render={
                                  <DialogTrigger
                                    render={
                                      <AspectRatio
                                        ratio={1 / 1}
                                        className="w-24 sm:w-32 lg:w-48"
                                      >
                                        <Avatar className="w-full h-full">
                                          <AvatarImage
                                            src={field.value}
                                            alt={
                                              user?.firstName?.charAt(0) ??
                                              'None'
                                            }
                                            className="hover:cursor-pointer"
                                          />
                                          <AvatarFallback className="text-3xl sm:text-4xl lg:text-7xl">
                                            {user?.firstName?.charAt(0) ??
                                              'None'}
                                          </AvatarFallback>
                                        </Avatar>
                                      </AspectRatio>
                                    }
                                  />
                                }
                              />

                              <DialogContent>
                                <FieldGroup className="gap-3">
                                  <AvatarCropper
                                    src={field.value || ''}
                                    onComplete={(dataUrl) => {
                                      field.onChange(dataUrl);
                                    }}
                                  />
                                  <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Choose Image</FieldLabel>
                                    <Input
                                      placeholder="https://example.com/my-avatar.png"
                                      type="file"
                                      accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onloadend = () => {
                                            field.onChange(
                                              reader.result as string
                                            );
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                    <FieldDescription>
                                      Choose a profile image from your device.
                                      Supported formats: PNG, JPEG, JPG, WEBP,
                                      GIF.
                                    </FieldDescription>
                                    {fieldState.invalid && (
                                      <FieldError errors={[fieldState.error]} />
                                    )}
                                  </Field>
                                </FieldGroup>
                              </DialogContent>
                            </Dialog>
                            <TooltipContent>Click To Change</TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    }}
                  />

                  <div className="grid md:grid-cols-2 gap-3">
                    <Controller
                      name="firstName"
                      control={profileForm.control}
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
                          <FieldDescription>
                            Please enter your first name.
                          </FieldDescription>
                        </Field>
                      )}
                    />

                    <Controller
                      name="lastName"
                      control={profileForm.control}
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
                          <FieldDescription>
                            Please enter your last name.
                          </FieldDescription>
                        </Field>
                      )}
                    />
                  </div>

                  <Controller
                    name="idNumber"
                    control={profileForm.control}
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
                        <FieldDescription>
                          Please enter your South African ID number.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="phone"
                    control={profileForm.control}
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
                        <FieldDescription>
                          Please enter your phone number.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit" className="w-full">
                  Save Information
                </Button>
              </form>
            </AccordionContent>
          </AccordionItem>

          {user?.type === 'business' && (
            <AccordionItem
              value="business-information"
              className="border-b px-3 last:border-b-0"
            >
              <AccordionTrigger>Business Information</AccordionTrigger>
              <AccordionContent>
                <form
                  className="flex flex-col w-full gap-3 p-1"
                  onSubmit={businessProfileForm.handleSubmit((values) =>
                    toast.promise(
                      saveProfile({
                        _id: user?._id,
                        businessName: values.businessName,
                        businessRegistrationNumber:
                          values.businessRegistrationNumber,
                      }),
                      {
                        loading: 'Saving your business information...',
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
                          businessProfileForm.reset({});

                          return 'Business information saved successfully!';
                        },
                      }
                    )
                  )}
                >
                  <FieldGroup className="gap-3">
                    <Controller
                      name="businessName"
                      control={businessProfileForm.control}
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
                          <FieldDescription>
                            Please enter your business's name.
                          </FieldDescription>
                        </Field>
                      )}
                    />

                    <Controller
                      name="businessRegistrationNumber"
                      control={businessProfileForm.control}
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
                          <FieldDescription>
                            Please enter your business's registration number.
                          </FieldDescription>
                        </Field>
                      )}
                    />
                  </FieldGroup>

                  <Button type="submit" className="w-full">
                    Save Information
                  </Button>
                </form>
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem
            value="location-information"
            className="border-b px-3 last:border-b-0"
          >
            <AccordionTrigger>Location Information</AccordionTrigger>
            <AccordionContent>
              <form
                className="flex flex-col w-full gap-3 p-1"
                onSubmit={locationForm.handleSubmit((values) =>
                  toast.promise(
                    saveProfile({
                      _id: user?._id,
                      streetAddress: values.streetAddress,
                      city: values.city,
                      areaCode: values.areaCode,
                      province: values.province,
                    }),
                    {
                      loading: 'Saving your location information...',
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
                        locationForm.reset({});

                        return 'Location information saved successfully!';
                      },
                    }
                  )
                )}
              >
                <FieldGroup className="gap-3">
                  <Controller
                    name="streetAddress"
                    control={locationForm.control}
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
                        <FieldDescription>
                          Please enter your street address.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="city"
                    control={locationForm.control}
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
                        <FieldDescription>
                          Please enter your city.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="areaCode"
                    control={locationForm.control}
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
                        <FieldDescription>
                          Please enter your postal code.
                        </FieldDescription>
                      </Field>
                    )}
                  />

                  <Controller
                    name="province"
                    control={locationForm.control}
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
                        <FieldDescription>
                          Please select your province.
                        </FieldDescription>
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Button type="submit" className="w-full">
                  Save Information
                </Button>
              </form>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
