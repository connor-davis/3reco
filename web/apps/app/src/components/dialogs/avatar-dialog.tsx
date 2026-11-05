import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveOverlay } from '@/components/responsive-overlay';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
};

type SliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function Control({ label, value, onChange }: SliderProps) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Slider
        aria-label={label}
        min={0}
        max={100}
        value={[value]}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </Field>
  );
}

/** Pick a picture, then zoom and move it. The preview is a drawn stand-in. */
export function AvatarDialog({ open, onOpenChange, name }: Props) {
  const [zoom, setZoom] = useState(30);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Change picture"
      description="Choose a photo, then line it up."
      footer={
        <Button
          onClick={() => {
            toast('Changing your picture is coming soon.');
            onOpenChange(false);
          }}
        >
          Use picture
        </Button>
      }
    >
      <div className="space-y-4">
        <Field>
          <FieldLabel htmlFor="avatar-file">Photo</FieldLabel>
          <Input id="avatar-file" type="file" accept="image/*" />
        </Field>
        <Avatar className="mx-auto size-24">
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <Control label="Zoom" value={zoom} onChange={setZoom} />
        <Control label="Left and right" value={x} onChange={setX} />
        <Control label="Up and down" value={y} onChange={setY} />
      </div>
    </ResponsiveOverlay>
  );
}
