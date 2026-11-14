import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  useAddStockPhoto,
  useDeleteStockPhoto,
  useReorderStockPhotos,
} from '@/lib/api/stock';
import type { StockItem, StockPhoto } from '@/lib/api/types';
import { errorText } from '@/components/transactions/pager-state';

export const MAX_PHOTOS = 8;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Props = {
  /** The stock line being edited. Without it, photos wait for the create. */
  stock?: StockItem;
  /** Files picked for a line that does not exist yet. */
  staged: File[];
  onStaged: (files: File[]) => void;
  error: string;
  onError: (message: string) => void;
  disabled: boolean;
  name: string;
};

/**
 * Up to 8 photos for one stock line. The first is the cover. On an existing
 * line every add, remove and move saves right away; on a new line the picks
 * wait until the line is created.
 */
export function StockPhotos({
  stock,
  staged,
  onStaged,
  error,
  onError,
  disabled,
  name,
}: Props) {
  const add = useAddStockPhoto();
  const remove = useDeleteStockPhoto(stock?.id ?? '');
  const reorder = useReorderStockPhotos(stock?.id ?? '');
  const [saved, setSaved] = useState<StockPhoto[]>(stock?.photos ?? []);
  const [dragged, setDragged] = useState<number>();
  const busy =
    disabled || add.isPending || remove.isPending || reorder.isPending;

  const previews = useMemo(
    () => staged.map((file) => URL.createObjectURL(file)),
    [staged]
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews]
  );

  const rows: { key: string; url: string }[] = stock
    ? saved.map((photo) => ({ key: photo.id, url: photo.url }))
    : previews.map((url, index) => ({ key: `${index}-${url}`, url }));

  // Every change returns the whole line, so the list always matches the server.
  async function change(run: () => Promise<StockItem>) {
    onError('');
    try {
      setSaved((await run()).photos);
    } catch (problem) {
      onError(errorText(problem));
    }
  }

  async function pick(files: File[]) {
    onError('');
    if (
      files.some(
        (f) =>
          !TYPES.includes(f.type) || f.size === 0 || f.size > 2 * 1024 * 1024
      )
    ) {
      onError('Choose a PNG, JPEG or WebP image up to 2 MiB.');
      return;
    }
    if (rows.length + files.length > MAX_PHOTOS) {
      onError(`A stock item can have up to ${MAX_PHOTOS} photos.`);
      return;
    }
    if (!stock) {
      onStaged([...staged, ...files]);
      return;
    }
    for (const file of files) {
      await change(() => add.mutateAsync({ id: stock.id, file }));
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    if (!stock) {
      const next = [...staged];
      next.splice(to, 0, ...next.splice(from, 1));
      onStaged(next);
      return;
    }
    const ids = saved.map((photo) => photo.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    void change(() => reorder.mutateAsync(ids));
  }

  function drop(index: number) {
    if (dragged !== undefined) move(dragged, index);
    setDragged(undefined);
  }

  function take(index: number) {
    if (stock) void change(() => remove.mutateAsync(saved[index].id));
    else onStaged(staged.filter((_, i) => i !== index));
  }

  return (
    <Field>
      <FieldLabel htmlFor="stock-photo">Photos</FieldLabel>
      <p className="text-sm text-muted-foreground">
        Upload a PNG, JPEG or WebP image up to 2 MiB. Add up to {MAX_PHOTOS};
        the first one is the cover.
      </p>
      <Input
        id="stock-photo"
        type="file"
        multiple
        accept={TYPES.join(',')}
        disabled={busy || rows.length >= MAX_PHOTOS}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) void pick(files);
        }}
      />
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.key}
              draggable={!busy}
              onDragStart={() => setDragged(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(index)}
              className="flex items-center gap-2 rounded-lg border p-2"
            >
              <img
                src={row.url}
                alt={`${name} photo ${index + 1}`}
                className="size-14 shrink-0 rounded-md object-cover"
              />
              <span className="min-w-0 flex-1 text-sm">
                {index === 0 ? 'Cover' : `Photo ${index + 1}`}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Move photo ${index + 1} up`}
                disabled={busy || index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Move photo ${index + 1} down`}
                disabled={busy || index === rows.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove photo ${index + 1}`}
                disabled={busy}
                onClick={() => take(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Field>
  );
}
