import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUploadAvatar, useDeleteAvatar } from '@/lib/api/avatar';
import { useProfile } from '@/lib/api/profile';
import { initials } from '@/lib/format';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
};

export function AvatarDialog({ open, onOpenChange, name }: Props) {
  return open ? <AvatarBody onOpenChange={onOpenChange} name={name} /> : null;
}

function AvatarBody({ onOpenChange, name }: Omit<Props, 'open'>) {
  const profile = useProfile();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const pending = upload.isPending || remove.isPending;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <ResponsiveOverlay
      open
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title="Change picture"
      description="Upload a PNG, JPEG or WebP image up to 2 MiB."
      footer={
        <>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={pending || !profile.data?.avatar_url}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Picture removed.');
                  onOpenChange(false);
                },
              })
            }
          >
            Remove picture
          </Button>
          <Button
            className="min-h-11"
            disabled={!file || pending}
            onClick={() =>
              file &&
              upload.mutate(file, {
                onSuccess: () => {
                  toast.success('Picture uploaded.');
                  onOpenChange(false);
                },
              })
            }
          >
            {upload.isPending ? 'Uploading…' : 'Upload picture'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field>
          <FieldLabel htmlFor="avatar-file">Photo</FieldLabel>
          <Input
            id="avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={pending}
            onChange={(event) => {
              const next = event.target.files?.[0];
              setFile(null);
              setPreview('');
              setError('');
              if (!next) return;
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(
                  next.type
                ) ||
                next.size === 0 ||
                next.size > 2 * 1024 * 1024
              ) {
                setError('Choose a PNG, JPEG or WebP image up to 2 MiB.');
                return;
              }
              setFile(next);
              setPreview(URL.createObjectURL(next));
            }}
          />
        </Field>
        <Avatar className="mx-auto size-24">
          <AvatarImage
            src={preview || profile.data?.avatar_url || undefined}
            alt={name}
          />
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        {(error || upload.error || remove.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || upload.error?.message || remove.error?.message}
          </p>
        )}
      </div>
    </ResponsiveOverlay>
  );
}
