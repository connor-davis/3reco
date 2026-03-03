import BackButton from '@/components/back-button';
import CreateMaterialDialog from '@/components/dialogs/materials/create';
import RemoveMaterialByIdDialog from '@/components/dialogs/materials/remove';
import EditMaterialByIdDialog from '@/components/dialogs/materials/update';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { PencilIcon, TrashIcon } from 'lucide-react';

export const Route = createFileRoute('/materials')({
  component: RouteComponent,
});

function RouteComponent() {
  const { results: materials } = useConvexPaginatedQuery(
    api.materials.listWithPagination,
    {},
    {
      initialNumItems: 50,
    }
  );

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

      <div className="flex flex-col w-full h-full overflow-y-auto gap-3">
        {materials?.map((material) => (
          <Item variant="muted" key={material._id}>
            <ItemContent>
              <ItemTitle>{material.name}</ItemTitle>
              <ItemDescription>
                The material has a carbon factor of {material.carbonFactor} kg
                CO₂e per kg, a GW code of {material.gwCode}, and a price of $
                {material.price} per kg.
              </ItemDescription>
            </ItemContent>

            <ItemActions>
              <EditMaterialByIdDialog _id={material._id}>
                <Button variant="ghost" size="icon">
                  <PencilIcon />
                </Button>
              </EditMaterialByIdDialog>

              <RemoveMaterialByIdDialog _id={material._id}>
                <Button variant="destructiveGhost" size="icon">
                  <TrashIcon />
                </Button>
              </RemoveMaterialByIdDialog>
            </ItemActions>
          </Item>
        ))}
      </div>
    </div>
  );
}
