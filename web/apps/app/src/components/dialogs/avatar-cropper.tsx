import { CheckIcon, CropIcon, MoveIcon, RefreshCcwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  centerCrop,
  makeAspectCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '../ui/button';
import { DialogClose } from '../ui/dialog';
import { Field, FieldContent, FieldDescription, FieldLabel } from '../ui/field';
import { Toggle } from '../ui/toggle';

type AvatarCropperProps = {
  src: string;
  onComplete: (dataUrl: string) => void;
};

export default function AvatarCropper({ src, onComplete }: AvatarCropperProps) {
  const [crop, setCrop] = useState<Crop>();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isCropping, setIsCropping] = useState(true);

  // --- compute and center a 1:1 crop based on actual image size
  const getCenteredSquareCrop = useCallback(
    (imageWidth: number, imageHeight: number): Crop => {
      return centerCrop(
        makeAspectCrop(
          {
            unit: 'px',
            width: Math.min(imageWidth, imageHeight),
          },
          1,
          imageWidth,
          imageHeight
        ),
        imageWidth,
        imageHeight
      );
    },
    []
  );

  const getCroppedImage = useCallback(
    (
      image: HTMLImageElement,
      crop: Crop,
      position: { x: number; y: number }
    ): string | null => {
      if (!crop?.width || !crop?.height) return null;

      const canvas = document.createElement('canvas');
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      canvas.width = crop.width;
      canvas.height = crop.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(
        image,
        (crop.x - position.x) * scaleX,
        (crop.y - position.y) * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );

      return canvas.toDataURL('image/gif');
    },
    []
  );

  const handleConfirmCrop = useCallback(() => {
    if (!imgRef.current || !crop) return;
    const dataUrl = getCroppedImage(imgRef.current, crop, position);
    if (dataUrl) onComplete(dataUrl);
  }, [crop, onComplete, getCroppedImage, position]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const newCrop = getCenteredSquareCrop(width, height);
      setCrop(newCrop);
      setPosition({ x: 0, y: 0 });
    },
    [getCenteredSquareCrop]
  );

  // --- pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left click only
    e.preventDefault();
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();

      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      setPosition((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
    },
    [dragging, setPosition]
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  if (src === '') return undefined;

  return (
    <Field>
      <FieldLabel>Crop Image</FieldLabel>

      <FieldContent
        ref={containerRef}
        className="flex flex-col w-full items-center justify-center relative"
      >
        <div className="flex items-center gap-3">
          <Toggle
            pressed={isCropping}
            value="crop"
            aria-label="Toggle cropping mode"
            onClick={() => setIsCropping(true)}
          >
            <CropIcon className="h-4 w-4" />
          </Toggle>

          <Toggle
            pressed={!isCropping}
            value="pan"
            aria-label="Toggle panning mode"
            onClick={() => setIsCropping(false)}
          >
            <MoveIcon className="h-4 w-4" />
          </Toggle>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setCrop(
                getCenteredSquareCrop(
                  imgRef.current?.width ?? 0,
                  imgRef.current?.height ?? 0
                )
              );
              setPosition({ x: 0, y: 0 });
            }}
          >
            <RefreshCcwIcon />
          </Button>

          <DialogClose>
            <Button variant="ghost" size="icon" onClick={handleConfirmCrop}>
              <CheckIcon />
            </Button>
          </DialogClose>
        </div>

        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          aspect={1}
          circularCrop
          ruleOfThirds
          locked={!isCropping}
          className="w-full"
        >
          <div
            className="cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              transition: dragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <img
              ref={imgRef}
              alt="Crop source"
              src={src}
              className="w-full max-h-128 overflow-hidden object-contain pointer-events-none"
              onLoad={handleImageLoad}
            />
          </div>
        </ReactCrop>
      </FieldContent>
      <FieldDescription>
        Use a square image. PNG, JPEG, JPG, WEBP, or GIF.
      </FieldDescription>
    </Field>
  );
}
