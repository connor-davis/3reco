// Package stats provides public community totals.
package stats

import (
	"context"

	store "github.com/connor-davis/3reco/internal/stores/stats"
)

// Service reads the public aggregate projection.
type Service struct{ records *store.Store }

// New builds the stats service.
func New(records *store.Store) *Service { return &Service{records: records} }

// Summary returns settled-trade totals without private account fields.
func (service *Service) Summary(ctx context.Context) (store.Summary, error) {
	return service.records.Summary(ctx)
}
