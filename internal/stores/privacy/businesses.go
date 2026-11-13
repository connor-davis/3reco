package privacy

import "context"

// AnonymiseOwnedBusinesses clears identifying fields only when this person is
// the last owner. Businesses with another owner keep their details and files.
func (s *Store) AnonymiseOwnedBusinesses(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Q(ctx).Query(ctx, `SELECT b.id, COALESCE(b.avatar_key,'')
		FROM businesses b JOIN business_members m ON m.business_id=b.id
		WHERE m.user_id=$1 AND m.role='owner' AND NOT EXISTS(
			SELECT 1 FROM business_members other JOIN users u ON u.id=other.user_id
			WHERE other.business_id=b.id AND other.user_id<>$1 AND other.role='owner'
			AND NOT u.is_removed) FOR UPDATE OF b`, userID)
	if err != nil {
		return nil, err
	}

	var ids, keys []string
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			rows.Close()

			return nil, err
		}

		ids = append(ids, id)
		if key != "" {
			keys = append(keys, key)
		}
	}

	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE transaction_request_messages m
		SET content=replace(m.content,b.business_name,'Removed account') FROM businesses b
		WHERE b.id=ANY($1) AND b.business_name IS NOT NULL AND m.sender_id=$2 AND m.system`,
		ids, userID)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Q(ctx).Exec(ctx, `UPDATE businesses SET business_name='Removed account',
		business_registration_number=NULL, bank_account_holder_name=NULL, bank_name=NULL,
		bank_account_number=NULL, bank_branch_code=NULL, bank_account_type=NULL,
		street_address=NULL, city=NULL, area_code=NULL, province=NULL, avatar_key=NULL, image=NULL,
		business_verified_at=NULL, business_verified_by=NULL, is_removed=true, updated_at=now()
		WHERE id=ANY($1)`, ids)

	return keys, err
}
