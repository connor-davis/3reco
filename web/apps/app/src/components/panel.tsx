import type { ComponentProps } from 'react';
import { Section } from '@/components/page-header';

/** A soft section surface with the shared Section heading and action slot. */
export function Panel(props: ComponentProps<typeof Section>) {
  return <Section {...props} panel />;
}
