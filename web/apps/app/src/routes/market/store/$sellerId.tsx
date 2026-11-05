import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  MapPin,
  MessageSquare,
  ShoppingCart,
  Store as StoreIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { VerifiedBadge } from '@/components/badges';
import { DataState } from '@/components/data-state';
import { ReviewDialog } from '@/components/dialogs/review-dialog';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { PersonAvatar, Stars } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/format';
import { myStoreId, storeById } from '@/lib/data/stores';
import { useMock, useMockList, useMarketListings } from '@/lib/mock/hooks';
import { useStartChat } from '@/lib/mock/use-start-chat';

export const Route = createFileRoute('/market/store/$sellerId')({
  component: StorePage,
});

function StorePage() {
  const { sellerId } = Route.useParams();
  const { role, data } = useMock();
  const listings = useMarketListings();
  const startChat = useStartChat();
  const reviews = useMockList('reviews');
  const [reviewOpen, setReviewOpen] = useState(false);

  const store = storeById(sellerId);
  const stock = listings.filter(
    (listing) => listing.storeId === store.id && listing.listed
  );
  const storeReviews = data.reviews.filter(
    (review) => review.storeId === store.id
  );
  // Only a finished trade with this store earns the right to review it.
  const tradedWithStore = data.transactions.some(
    (tx) =>
      tx.status === 'Completed' &&
      [tx.buyer, tx.seller].includes(store.name) &&
      [tx.buyer, tx.seller].includes(storeById(myStoreId).name)
  );
  const canReview =
    role === 'business' &&
    store.id !== myStoreId &&
    tradedWithStore &&
    !storeReviews.some((review) => review.mine);

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 rounded-3xl bg-muted p-6">
        <PersonAvatar
          name={store.name}
          online={store.online}
          className="size-16"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {store.name}
          </h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            {store.suburb}, {store.city}
            {store.online && ' · Online now'}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Stars value={store.rating} />
            {store.rating} / 5 · {store.reviewCount} reviews · Member since{' '}
            {store.memberSince}
          </p>
          <VerifiedBadge verified={store.verified} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const lot = stock[0];
              if (lot) startChat(lot);
              else toast('This store has nothing listed to ask about yet.');
            }}
          >
            <MessageSquare data-icon="inline-start" />
            Message store
          </Button>
          {role === 'business' && (
            <LinkButton to="/cart" variant="outline">
              <ShoppingCart data-icon="inline-start" />
              Cart
            </LinkButton>
          )}
        </div>
      </header>
      <Tabs defaultValue="stock" className="mt-8">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="stock">Stock · {stock.length}</TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews · {store.reviewCount}
          </TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="mt-6">
          <DataState
            isEmpty={stock.length === 0}
            icon={StoreIcon}
            emptyTitle="Nothing listed right now"
            emptyText="Check back soon, or send the store a message."
          >
            <p className="mb-4 text-sm text-muted-foreground">
              Available stock. Prices can be discussed in chat.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {stock.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </DataState>
        </TabsContent>
        <TabsContent value="reviews" className="mt-6">
          <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
            <div className="space-y-2">
              <p className="text-5xl font-semibold tabular-nums">
                {store.rating}
              </p>
              <Stars value={store.rating} />
              <p className="text-sm text-muted-foreground">
                {store.reviewCount} completed-trade reviews
              </p>
              {canReview && (
                <Button variant="outline" onClick={() => setReviewOpen(true)}>
                  Leave a review
                </Button>
              )}
            </div>
            <DataState
              isEmpty={storeReviews.length === 0}
              icon={MessageSquare}
              emptyTitle="No reviews yet"
              emptyText="Reviews appear after a completed trade."
            >
              <ul className="space-y-4">
                {storeReviews.map((review, index) => (
                  <li key={review.id}>
                    {index > 0 && <Separator className="mb-4" />}
                    <p className="font-medium">{review.reviewer}</p>
                    <Stars value={review.rating} />
                    <p className="mt-1">{review.comment}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(review.date)}
                    </p>
                    {review.mine && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          reviews.remove(review.id);
                          toast.success('Review deleted.');
                        }}
                      >
                        Delete my review
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </DataState>
          </div>
        </TabsContent>
        <TabsContent value="about" className="mt-6">
          <dl className="grid max-w-md gap-3 text-sm">
            <Detail label="Contact" value={store.contact} />
            <Detail label="Phone" value={store.phone} />
            <Detail
              label="Location"
              value={`${store.suburb}, ${store.city}, ${store.province}`}
            />
            <Detail label="Trading hours" value={store.hours} />
          </dl>
        </TabsContent>
      </Tabs>
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        storeId={store.id}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
