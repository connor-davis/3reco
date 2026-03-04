import BackButton from '@/components/back-button';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { MinusIcon, PlusIcon, ShoppingCartIcon, StoreIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/market/store/$sellerId')({
  component: RouteComponent,
});

type CartItem = {
  stockId: Id<'stock'>;
  materialId: Id<'materials'>;
  materialName: string;
  weight: number;
  price: number;
};

function RouteComponent() {
  const { sellerId } = Route.useParams();
  const stock = useConvexQuery(api.stock.listListedBySeller, {
    sellerId: sellerId as Id<'users'>,
  });
  const materials = useConvexQuery(api.materials.list, {});
  const seller = useConvexQuery(api.users.findById, {
    _id: sellerId as Id<'users'>,
  });
  const createRequest = useConvexMutation(api.transactionRequests.create);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const materialMap = new Map(materials?.map((m) => [m._id, m]) ?? []);
  const sellerName =
    seller?.businessName ??
    (`${seller?.firstName ?? ''} ${seller?.lastName ?? ''}`.trim() || 'Store');

  function addToCart(stockItem: NonNullable<typeof stock>[number]) {
    const material = materialMap.get(stockItem.materialId);
    if (!material) return;
    setCart((prev) => {
      if (prev.find((c) => c.stockId === stockItem._id)) return prev;
      return [
        ...prev,
        {
          stockId: stockItem._id,
          materialId: stockItem.materialId,
          materialName: material.name,
          weight: stockItem.weight,
          price: stockItem.price,
        },
      ];
    });
  }

  function removeFromCart(stockId: Id<'stock'>) {
    setCart((prev) => prev.filter((c) => c.stockId !== stockId));
  }

  function handleSubmit() {
    if (cart.length === 0 || submitted) return;
    setSubmitted(true);
    toast.promise(
      createRequest({
        sellerId: sellerId as Id<'users'>,
        items: cart.map((c) => ({
          materialId: c.materialId,
          stockId: c.stockId,
        })),
      }),
      {
        loading: 'Sending request...',
        success: () => {
          setCart([]);
          setSubmitted(false);
          return 'Request sent! View it in Outgoing Requests.';
        },
        error: (error: Error) => {
          setSubmitted(false);
          if (error instanceof ConvexError) {
            return {
              message: error.data.name,
              description: error.data.message,
            };
          }
          return { message: error.name, description: error.message };
        },
      }
    );
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.weight, 0);

  return (
    <div className="flex flex-col w-full h-full gap-3 overflow-hidden">
      <div className="flex items-center w-full h-auto gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <Label className="text-lg">{sellerName}</Label>
        </div>
        {cart.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <ShoppingCartIcon className="size-4" />
            {cart.length} item{cart.length !== 1 ? 's' : ''} in request
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 overflow-hidden flex-1 min-h-0">
        <div className="flex flex-col flex-1 overflow-y-auto gap-2 min-h-0">
          {(!stock || stock.length === 0) && (
            <div className="flex flex-col w-full h-full items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <StoreIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Listings</EmptyTitle>
                  <EmptyDescription>
                    This seller has no active stock listings.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
          {stock &&
            stock.map((item) => {
              const material = materialMap.get(item.materialId);
              const inCart = cart.some((c) => c.stockId === item._id);
              return (
                <div
                  key={item._id}
                  className="flex items-center justify-between p-3 border rounded-xl"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {material?.name ?? 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.weight} kg @ R{item.price}/kg — Total: R
                      {(item.weight * item.price).toFixed(2)}
                    </span>
                  </div>
                  {inCart ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeFromCart(item._id)}
                    >
                      <MinusIcon className="size-3" /> Remove
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => addToCart(item)}>
                      <PlusIcon className="size-3" /> Add to Request
                    </Button>
                  )}
                </div>
              );
            })}
        </div>

        {cart.length > 0 && (
          <div className="flex flex-col gap-3 lg:w-72 border rounded-xl p-4 bg-muted/30 shrink-0 overflow-y-auto">
            <Label className="text-sm font-semibold">Request Summary</Label>
            <div className="flex flex-col gap-2">
              {cart.map((item) => (
                <div
                  key={item.stockId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="truncate max-w-32">{item.materialName}</span>
                  <span className="text-muted-foreground shrink-0">
                    {item.weight}kg x R{item.price}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 flex items-center justify-between text-sm font-medium">
              <span>Est. Total</span>
              <span>R{cartTotal.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The seller will confirm weights and final price.
            </p>
            <Button onClick={handleSubmit} disabled={submitted}>
              Send Request
            </Button>
            <Button variant="outline" onClick={() => setCart([])}>
              Clear Cart
            </Button>
            <Link
              to="/market/outgoing"
              className="text-xs text-center text-muted-foreground hover:underline"
            >
              View Outgoing Requests
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
