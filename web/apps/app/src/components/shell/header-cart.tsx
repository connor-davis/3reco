import { Link } from '@tanstack/react-router';
import { ShoppingCart } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { Badge } from '@/components/ui/badge';
import { useCartStores } from '@/lib/api/cart';
import { plural } from '@/lib/format';

export function HeaderCart() {
  const stores = useCartStores();
  const count =
    stores.data?.items.reduce((sum, store) => sum + store.item_count, 0) ?? 0;

  return (
    <IconButton
      label={count > 0 ? `Cart, ${plural(count, 'item')}` : 'Cart'}
      className="relative"
      nativeButton={false}
      render={<Link to="/cart" />}
    >
      <ShoppingCart aria-hidden="true" />
      {count > 0 && (
        <Badge
          className="absolute top-1 left-1/2 ml-2 h-4 min-w-4 px-1"
          aria-hidden="true"
        >
          {count > 9 ? '9+' : count}
        </Badge>
      )}
    </IconButton>
  );
}
