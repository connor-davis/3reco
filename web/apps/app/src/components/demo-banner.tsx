import { useAppConfig } from '@/lib/api/app-config';

/** A strip on every page of the demo site, sign-in included. */
export function DemoBanner() {
  const { demo } = useAppConfig();

  if (!demo) return null;

  return (
    <div
      role="status"
      className="bg-primary px-4 py-1.5 text-center text-sm font-medium text-primary-foreground"
    >
      Demo: nothing here is real
    </div>
  );
}
