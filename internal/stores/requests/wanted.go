package requests

import "context"

// InsertWanted writes the pending request a seller's reply to a wanted post
// starts. Its one item is the post's material and weight, with no stock row:
// the seller's stock is held when they make their offer.
func (s *Store) InsertWanted(
	ctx context.Context,
	id, sellerID, buyerID, postID, materialID, weight string,
	maxPrice *string,
) error {
	q := s.db.Q(ctx)

	_, err := q.Exec(ctx, `
		INSERT INTO transaction_requests (id, seller_id, buyer_id, status, wanted_post_id)
		VALUES ($1, $2, $3, 'pending', $4)`, id, sellerID, buyerID, postID)
	if err != nil {
		return err
	}

	_, err = q.Exec(ctx, `
		INSERT INTO transaction_request_items
			(request_id, position, material_id, requested_weight, requested_price)
		VALUES ($1, 0, $2, $3::numeric, $4::numeric)`, id, materialID, weight, maxPrice)

	return err
}

// LockWantedPost locks a wanted post row until the transaction ends. Every path
// that touches a post and its replies takes this lock first, so two of them
// can never wait on each other's request rows.
func (s *Store) LockWantedPost(ctx context.Context, postID string) error {
	_, err := s.db.Q(ctx).Exec(ctx, `SELECT 1 FROM wanted_posts WHERE id=$1 FOR UPDATE`, postID)

	return err
}

// SetWantedStatus moves a locked wanted post to filled or closed.
func (s *Store) SetWantedStatus(ctx context.Context, postID, status string) error {
	_, err := s.db.Q(ctx).Exec(ctx,
		`UPDATE wanted_posts SET status=$2, updated_at=now() WHERE id=$1`, postID, status)

	return err
}

// EndedReply is a reply that was just cancelled, so its seller can be told.
type EndedReply struct{ ID, SellerID string }

// CancelWantedReplies cancels every open reply of a post except one: it frees
// the holds, drops any half-confirmed trade and the offer, and returns what it
// cancelled. The caller holds the post lock and runs in one transaction.
func (s *Store) CancelWantedReplies(
	ctx context.Context,
	postID, exceptID string,
) ([]EndedReply, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `
		SELECT id, seller_id FROM transaction_requests
		WHERE wanted_post_id=$1 AND id<>$2 AND status IN ('pending','offered')
		ORDER BY id FOR UPDATE`, postID, exceptID)
	if err != nil {
		return nil, err
	}

	var ended []EndedReply

	for rows.Next() {
		var reply EndedReply

		if err := rows.Scan(&reply.ID, &reply.SellerID); err != nil {
			rows.Close()

			return nil, err
		}

		ended = append(ended, reply)
	}

	rows.Close()

	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, reply := range ended {
		if err := s.ReleaseHolds(ctx, reply.ID); err != nil {
			return nil, err
		}

		if err := s.ResetConfirmation(ctx, reply.ID); err != nil {
			return nil, err
		}

		if err := s.ClearOffers(ctx, reply.ID); err != nil {
			return nil, err
		}

		if err := s.SetStatus(ctx, reply.ID, "cancelled"); err != nil {
			return nil, err
		}
	}

	return ended, nil
}
