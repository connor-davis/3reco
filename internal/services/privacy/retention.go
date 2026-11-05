package privacy

import (
	"context"
	"errors"
	"log/slog"

	"github.com/connor-davis/3reco/internal/platform/config"
)

// Retain runs the hourly clean-up: old notifications, forgotten carts, the
// personal details of trades past the retention period, and old audit lines.
// Every step is one statement that only touches rows that are due, so running
// it again does nothing new. One failing step does not stop the others.
func (s *Service) Retain(ctx context.Context) error {
	keys, anonymiseErr := s.store.AnonymiseTrades(ctx, config.TradeRetentionYears)

	// The rows are already updated, so the files are removed even if a later
	// step fails. A file that cannot be removed is logged, not retried.
	for _, key := range keys {
		if err := s.objects.Remove(ctx, key); err != nil {
			slog.Warn("old invoice not removed", "key", key, "err", err)
		}
	}

	return errors.Join(
		anonymiseErr,
		s.store.PurgeNotifications(ctx, config.NotificationRetentionDays),
		s.store.PurgeCarts(ctx, config.CartRetentionDays),
		s.store.PurgeEvents(ctx, config.PrivacyEventRetentionYears),
	)
}
