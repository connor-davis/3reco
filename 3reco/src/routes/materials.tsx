import BackButton from '@/components/back-button';
import CreateMaterialDialog from '@/components/dialogs/materials/create';
import { Label } from '@/components/ui/label';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/materials')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />

          <Label className="text-lg">Materials</Label>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <CreateMaterialDialog />
        </div>
      </div>

      <div className="flex flex-col w-full h-full overflow-y-auto"></div>
    </div>
  );
}
