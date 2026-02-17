import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod/v4';
import { Button } from '../ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field';
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
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
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

export default function CompleteProfileGuard() {
  const router = useRouter();

  const { data: user, isLoading: isLoadingUser } = useSuspenseQuery({
    ...convexQuery(api.users.currentUser),
    retry: false,
  });

  const [tab, setTab] = useState<
    'basicInfo' | 'businessOrCollector' | 'businessInfo' | 'locationInfo'
  >('basicInfo');

  const updateUser = useConvexMutation(api.users.update);

  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);

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

  const onCropComplete = (pixelCrop: PixelCrop) => {
    if (imgRef.current && pixelCrop.width && pixelCrop.height) {
      const base64 = getCroppedImg(imgRef.current, pixelCrop);
      basicInfoForm.setValue('image', base64);
    }
  };

  if (isLoadingUser)
    return (
      <div className="flex flex-col w-screen h-screen items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex items-center gap-3">
          <Spinner className="text-primary" />
          <Label className="text-muted-foreground">
            Loading user profile...
          </Label>
        </div>
      </div>
    );

  return (
    <Tabs value={tab} className="flex flex-col w-screen h-screen bg-background">
      <TabsContent value="basicInfo">
        <div className="flex flex-col w-full h-full items-center justify-center">
          <form
            id="form-basic-info"
            onSubmit={basicInfoForm.handleSubmit(
              (values) =>
                toast.promise(
                  updateUser({
                    _id: user._id,
                    name: [values.firstName, values.lastName].join(' '),
                    type: 'collector',
                    ...values,
                  }),
                  {
                    loading: 'Updating your profile information...',
                    error: (error: Error) =>
                      toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      }),
                    success: () => {
                      setTab('businessOrCollector');

                      return 'Your profile has been updated.';
                    },
                  }
                ),
              console.log
            )}
            className="flex flex-col w-full max-w-120 h-auto gap-5"
          >
            <FieldGroup>
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

      <TabsContent value="businessOrCollector">
        <div className="flex flex-col w-full h-full items-center justify-center gap-10">
          <div className="flex flex-col gap-3 items-center w-full max-w-120">
            <Avatar className="w-1/2 h-1/2 md:w-64 md:h-64">
              <AvatarImage src={user.image} />
              <AvatarFallback>{user.firstName?.charAt(0)}</AvatarFallback>
            </Avatar>

            <Label className="text-lg">Hello, {user.name}</Label>
            <Label className="text-muted-foreground">
              Are you a business or a collector?
            </Label>
          </div>

          <div className="grid md:grid-cols-2 gap-3 w-full max-w-120">
            <Button onClick={() => setTab('businessInfo')}>
              I'm A Business
            </Button>
            <Button onClick={() => setTab('locationInfo')}>
              I'm A Collector
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="businessInfo">
        <div className="flex flex-col w-full h-full items-center justify-center gap-10">
          <form
            id="form-basic-info"
            onSubmit={businessInfoForm.handleSubmit(
              (values) =>
                toast.promise(
                  updateUser({
                    _id: user._id,
                    type: 'business',
                    ...values,
                  }),
                  {
                    loading: 'Updating your profile information...',
                    error: (error: Error) =>
                      toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      }),
                    success: () => {
                      setTab('locationInfo');

                      return 'Your profile has been updated.';
                    },
                  }
                ),
              console.log
            )}
            className="flex flex-col w-full max-w-120 h-auto gap-5"
          >
            <FieldGroup>
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

      <TabsContent value="locationInfo">
        <div className="flex flex-col w-full h-full items-center justify-center gap-10">
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
                    error: (error: Error) =>
                      toast.error(error.name, {
                        description: error.message,
                        duration: 2000,
                      }),
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
            className="flex flex-col w-full max-w-120 h-auto gap-5"
          >
            <FieldGroup>
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
              <Button type="button" onClick={() => setTab('basicInfo')}>
                Previous
              </Button>
              <Button type="submit">Complete Profile</Button>
            </div>
          </form>
        </div>
      </TabsContent>
    </Tabs>
  );
}
