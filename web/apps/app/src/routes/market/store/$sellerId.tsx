import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MessageSquare, Store as StoreIcon } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ButtonRow } from '@/components/button-row';
import { Panel } from '@/components/panel';
import { DataState } from '@/components/data-state';
import { ReviewDialog } from '@/components/dialogs/review-dialog';
import { LinkButton } from '@/components/link-button';
import { ListingCard } from '@/components/listing-card';
import { PersonAvatar, Stars } from '@/components/visuals';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewMessageDialog } from '@/components/dialogs/new-message-dialog';
import type { Listing } from '@/lib/api/types';
import { useStore } from '@/lib/api/stores';
import { useStoreListings } from '@/lib/api/listings';
import {
  useReviews,
  useDeleteReview,
  useReviewSummary,
  useReviewable,
} from '@/lib/api/reviews';
import { useAuth } from '@/lib/auth/use-auth';
import { formatDate, plural, toGrams } from '@/lib/format';

export const Route = createFileRoute('/market/store/$sellerId')({
  component: StorePage,
});

function StorePage() {
  const { sellerId } = Route.useParams();
  const { user } = useAuth();
  const store = useStore(sellerId);
  const [stockCursor, setStockCursor] = useState<string>();
  const [reviewCursor, setReviewCursor] = useState<string>();
  const listings = useStoreListings(sellerId, { cursor: stockCursor });
  const reviews = useReviews(sellerId, { cursor: reviewCursor });
  const summary = useReviewSummary(sellerId);
  const remove = useDeleteReview();
  const eligible = useReviewable(
    sellerId,
    user?.role === 'business' && user.id !== sellerId
  );
  const [chatListing, setChatListing] = useState<Listing | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <DataState
      query={store}
      isEmpty={!store.data}
      icon={StoreIcon}
      emptyTitle="This store is no longer on 3REco."
      emptyText="Browse materials to find other stores."
      emptyAction={<LinkButton to="/market">Browse materials</LinkButton>}
    >
      {store.data && (
        <>
          <StoreTitle key={sellerId} name={store.data.name} />
          <NewMessageDialog
            open={chatListing !== null}
            onOpenChange={(open) => {
              if (!open) setChatListing(null);
            }}
            listing={chatListing ?? undefined}
          />
          <Panel title="Store details">
            <header className="flex flex-wrap items-center gap-4">
              <PersonAvatar
                name={store.data.name}
                image={
                  store.data.avatar_url
                    ? store.data.avatar_url + '?v=' + store.dataUpdatedAt
                    : undefined
                }
                className="size-16"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-2xl font-semibold">{store.data.name}</h1>
                <p>
                  {[store.data.city, store.data.province]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Member since {formatDate(store.data.created_at)}
                </p>
              </div>
              {user?.role === 'business' && user.id !== sellerId && (
                <ButtonRow>
                  <Button
                    nativeButton={false}
                    render={
                      <Link to="/cart" search={{ seller_id: sellerId }} />
                    }
                    variant="outline"
                  >
                    Cart
                  </Button>
                  <Button
                    disabled={
                      !listings.data?.items.some(
                        (item) => toGrams(item.weight) > 0
                      )
                    }
                    onClick={() => {
                      const item = listings.data?.items.find(
                        (item) => toGrams(item.weight) > 0
                      );
                      if (item) setChatListing(item);
                    }}
                  >
                    Message store
                  </Button>
                </ButtonRow>
              )}
            </header>
          </Panel>
          <Tabs defaultValue="stock" className="mt-8">
            <TabsList>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>
            <TabsContent value="stock" className="mt-6">
              <DataState
                query={listings}
                isEmpty={!listings.data?.items.length}
                icon={StoreIcon}
                emptyTitle="Nothing listed right now"
                emptyText="This store has no materials listed."
              >
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {listings.data?.items.map((item) => (
                    <ListingCard
                      key={item.id}
                      listing={item}
                      showSeller={false}
                    />
                  ))}
                </div>
              </DataState>
              <div className="my-4 flex gap-3">
                {stockCursor && (
                  <Button
                    variant="outline"
                    onClick={() => setStockCursor(undefined)}
                  >
                    First page
                  </Button>
                )}
                {listings.data?.has_more && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setStockCursor(listings.data?.next_cursor ?? undefined)
                    }
                  >
                    Next page
                  </Button>
                )}
              </div>
            </TabsContent>
            <TabsContent value="reviews" className="mt-6 space-y-4">
              <DataState
                query={summary}
                icon={MessageSquare}
                emptyTitle="Reviews"
                emptyText="Reviews appear after a trade."
              >
                {summary.data && (
                  <div className="space-y-2">
                    {summary.data.average !== null && (
                      <Stars value={summary.data.average} />
                    )}
                    <p>
                      {plural(summary.data.count, 'completed-trade review')}
                    </p>
                  </div>
                )}
              </DataState>
              {user?.id === sellerId && (
                <p className="text-sm text-muted-foreground">
                  Buyers review your store after a completed trade.
                </p>
              )}
              {user?.role === 'business' && user.id !== sellerId && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setReviewOpen(true)}
                    disabled={
                      eligible.isPending ||
                      eligible.isError ||
                      !eligible.data?.items.length
                    }
                  >
                    Leave a review
                  </Button>
                  {eligible.isSuccess && !eligible.data.items.length && (
                    <p className="text-sm text-muted-foreground">
                      Reviews are for completed purchases from this store. Each
                      purchase can be reviewed once.
                    </p>
                  )}
                  {eligible.isError && (
                    <p role="alert" className="text-sm text-destructive">
                      Could not check completed trades.{' '}
                      <Button
                        variant="link"
                        onClick={() => void eligible.refetch()}
                      >
                        Try again
                      </Button>
                    </p>
                  )}
                </>
              )}
              <DataState
                query={reviews}
                isEmpty={!reviews.data?.items.length}
                icon={MessageSquare}
                emptyTitle="No reviews yet"
                emptyText={
                  user?.id === sellerId
                    ? "Your buyers' reviews will appear here after a completed trade."
                    : 'Be the first to review this store.'
                }
              >
                <ul className="space-y-4">
                  {reviews.data?.items.map((review) => (
                    <li key={review.id} className="space-y-2 border-b pb-4">
                      <p className="font-medium">{review.reviewer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {review.materials}
                      </p>
                      <Stars value={review.rating} />
                      <p>{review.comment}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(review.created_at)}
                      </p>
                      {user?.role === 'admin' && (
                        <Button
                          variant="destructive"
                          disabled={remove.isPending}
                          onClick={() => setDeleteId(review.id)}
                        >
                          Delete review
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </DataState>
              {remove.error && (
                <p role="alert" className="text-destructive">
                  {remove.error.message}
                </p>
              )}
              <div className="flex gap-3">
                {reviewCursor && (
                  <Button
                    variant="outline"
                    onClick={() => setReviewCursor(undefined)}
                  >
                    First page
                  </Button>
                )}
                {reviews.data?.has_more && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setReviewCursor(reviews.data?.next_cursor ?? undefined)
                    }
                  >
                    Next page
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <ConfirmDialog
            open={deleteId !== null}
            onOpenChange={(open) => !open && setDeleteId(null)}
            title="Delete this review?"
            description="The review is removed for good. This cannot be undone."
            confirmLabel="Delete review"
            onConfirm={() => {
              if (deleteId) remove.mutate(deleteId);
              setDeleteId(null);
            }}
          />
          {reviewOpen && (
            <ReviewDialog
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              storeId={sellerId}
            />
          )}
        </>
      )}
    </DataState>
  );
}

function StoreTitle({ name }: { name: string }) {
  useEffect(() => {
    document.title = `${name} · 3REco`;
  }, [name]);

  return null;
}
