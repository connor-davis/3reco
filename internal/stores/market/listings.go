package market

import (
	"context"
	"time"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/paging"
	"github.com/connor-davis/3reco/internal/stores/stock"
)

// Listing is an allowlisted market view, never a private user or stock record.
type Listing struct {
	ImageURL        string    `json:"image_url"`
	ImageURLs       []string  `json:"image_urls"`
	SellerAvatarURL string    `json:"seller_avatar_url"`
	ID              string    `json:"id"`
	SellerID        string    `json:"seller_id"`
	SellerName      string    `json:"seller_name"`
	SellerVerified  bool      `json:"seller_verified"`
	MaterialID      string    `json:"material_id"`
	MaterialName    string    `json:"material_name"`
	CarbonFactor    string    `json:"carbon_factor"`
	GWCode          string    `json:"gw_code"`
	HeldWeight      string    `json:"held_weight"`
	Weight          string    `json:"weight"`
	Price           string    `json:"price"`
	AverageRating   *float64  `json:"average_rating"`
	ReviewCount     int       `json:"review_count"`
	CreatedAt       time.Time `json:"created_at"`
}

// Filter narrows public listings before paging.
type Filter struct {
	SellerID     string
	MaterialID   string
	Search       string
	ExcludeOwner string
	// ViewerID is the caller, who may see their own stock even when unverified.
	ViewerID string
}

var listingColumns = `s.id,s.owner_id,` + database.DisplayName("u") + `,
	s.material_id,m.name,m.carbon_factor::text,m.gw_code,GREATEST(s.weight-COALESCE(h.held,0),0)::text,s.price::text,
	s.created_at,COALESCE(h.held,0)::text,
	` + stock.CoverURL("s") + `,` + stock.PhotoURLs("s") + `,
	CASE WHEN u.avatar_key IS NOT NULL THEN '/api/stores/'||u.id||'/logo?v='||md5(u.avatar_key) ELSE COALESCE(u.image,'') END,
	` + database.Verified("u")

// Held weight is summed once for all stock, not once per row through stock_available().
const listingJoin = ` FROM stock s JOIN materials m ON m.id=s.material_id
	JOIN business_profiles u ON u.id=s.owner_id
	LEFT JOIN (SELECT stock_id,sum(weight) AS held FROM stock_holds
		WHERE status='active' AND expires_at>clock_timestamp() GROUP BY stock_id) h ON h.stock_id=s.id
	WHERE s.is_listed AND s.weight>0
	AND NOT u.is_removed AND u.role='business'`

// sellerVisible hides an unverified business's stock from everyone but its owner,
// whose id is the numbered placeholder.
func sellerVisible(viewer string) string {
	return ` AND (` + database.Verified("u") + ` OR u.id=` + viewer + `)`
}

// Listings excludes hidden, empty and removed-seller stock at the SQL boundary.
func (records *Store) Listings(ctx context.Context, filter Filter, query paging.Query) ([]Listing, error) {
	rows, err := records.db.Q(ctx).Query(
		ctx,
		`SELECT `+listingColumns+listingJoin+sellerVisible("$8")+`
		AND ($1='' OR s.owner_id=$1) AND ($2='' OR s.material_id=$2)
		AND ($3='' OR m.name ILIKE '%'||$3||'%' OR u.business_name ILIKE '%'||$3||'%')
		AND ($4='' OR s.owner_id<>$4) AND ($5='' OR (s.created_at,s.id)<($6,$5))
		ORDER BY s.created_at DESC,s.id DESC LIMIT NULLIF($7,0)`,
		filter.SellerID,
		filter.MaterialID,
		filter.Search,
		filter.ExcludeOwner,
		query.ID,
		query.At,
		query.Size(),
		filter.ViewerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Listing{}
	for rows.Next() {
		var item Listing
		if err := rows.Scan(
			&item.ID,
			&item.SellerID,
			&item.SellerName,
			&item.MaterialID,
			&item.MaterialName,
			&item.CarbonFactor,
			&item.GWCode,
			&item.Weight,
			&item.Price,
			&item.CreatedAt,
			&item.HeldWeight,
			&item.ImageURL,
			&item.ImageURLs,
			&item.SellerAvatarURL,
			&item.SellerVerified,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

// Listing reads only stock that can currently be seen on the marketplace.
func (records *Store) Listing(ctx context.Context, id, viewer string) (Listing, error) {
	var item Listing
	err := records.db.Q(ctx).QueryRow(
		ctx,
		`SELECT `+listingColumns+listingJoin+sellerVisible("$2")+` AND s.id=$1`,
		id,
		viewer,
	).Scan(
		&item.ID,
		&item.SellerID,
		&item.SellerName,
		&item.MaterialID,
		&item.MaterialName,
		&item.CarbonFactor,
		&item.GWCode,
		&item.Weight,
		&item.Price,
		&item.CreatedAt,
		&item.HeldWeight,
		&item.ImageURL,
		&item.ImageURLs,
		&item.SellerAvatarURL,
		&item.SellerVerified,
	)

	return item, err
}
