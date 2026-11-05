package stock

import "context"

// NotifyListing inserts the owner's notification in the caller's stock transaction.
func (records *Store) NotifyListing(ctx context.Context, id, owner, kind, title, body string) error {
	_, err := records.db.Q(ctx).Exec(
		ctx,
		`INSERT INTO notifications(id,user_id,type,title,body,link)
		VALUES($1,$2,$3,$4,$5,'/stock')`,
		id,
		owner,
		kind,
		title,
		body,
	)

	return err
}
