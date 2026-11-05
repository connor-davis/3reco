package api

import (
	"github.com/gofiber/fiber/v3"
	"go.uber.org/fx"

	adminapi "github.com/connor-davis/3reco/internal/api/admin"
	notesapi "github.com/connor-davis/3reco/internal/api/notifications"
	requestsapi "github.com/connor-davis/3reco/internal/api/requests"
	reviewsapi "github.com/connor-davis/3reco/internal/api/reviews"
	transactionsapi "github.com/connor-davis/3reco/internal/api/transactions"
	adminsvc "github.com/connor-davis/3reco/internal/services/admin"
	notessvc "github.com/connor-davis/3reco/internal/services/notifications"
	requestssvc "github.com/connor-davis/3reco/internal/services/requests"
	reviewssvc "github.com/connor-davis/3reco/internal/services/reviews"
	transactionssvc "github.com/connor-davis/3reco/internal/services/transactions"
	adminstore "github.com/connor-davis/3reco/internal/stores/admin"
	notesstore "github.com/connor-davis/3reco/internal/stores/notifications"
	requestsstore "github.com/connor-davis/3reco/internal/stores/requests"
	reviewsstore "github.com/connor-davis/3reco/internal/stores/reviews"
	transactionsstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

// tradeProviders builds the trade and operations area: requests, transactions,
// reviews, notifications and admin.
var tradeProviders = fx.Provide(
	notesstore.New, notessvc.New, notesapi.New,
	transactionsstore.New, transactionssvc.New, transactionsapi.New,
	requestsstore.New, requestssvc.New, requestsapi.New,
	reviewsstore.New, reviewssvc.New, reviewsapi.New,
	adminstore.New, adminsvc.New, adminapi.New,
)

// tradeRoutes holds the handlers of the trade area.
type tradeRoutes struct {
	fx.In

	Notifications *notesapi.Handler
	Requests      *requestsapi.Handler
	Transactions  *transactionsapi.Handler
	Reviews       *reviewsapi.Handler
	Admin         *adminapi.Handler
}

// register adds the trade routes under /api.
func (t tradeRoutes) register(api fiber.Router) {
	t.Notifications.Register(api.Group("/notifications"))
	t.Requests.Register(api)
	t.Transactions.Register(api)
	t.Reviews.Register(api)
	t.Admin.Register(api)
}
