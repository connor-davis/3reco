// Package api builds the Fiber server: shared steps, route registration per
// area, and the fx module that wires services, handlers and the listener.
// It holds no SQL; statements live in internal/stores.
package api

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/compress"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"go.uber.org/fx"

	authapi "github.com/connor-davis/3reco/internal/api/auth"
	collectorsapi "github.com/connor-davis/3reco/internal/api/collectors"
	marketapi "github.com/connor-davis/3reco/internal/api/market"
	materialsapi "github.com/connor-davis/3reco/internal/api/materials"
	"github.com/connor-davis/3reco/internal/api/middleware"
	privacyapi "github.com/connor-davis/3reco/internal/api/privacy"
	profileapi "github.com/connor-davis/3reco/internal/api/profile"
	"github.com/connor-davis/3reco/internal/api/sockets"
	statsapi "github.com/connor-davis/3reco/internal/api/stats"
	stockapi "github.com/connor-davis/3reco/internal/api/stock"
	storesapi "github.com/connor-davis/3reco/internal/api/stores"
	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	collectorssvc "github.com/connor-davis/3reco/internal/services/collectors"
	marketsvc "github.com/connor-davis/3reco/internal/services/market"
	materialssvc "github.com/connor-davis/3reco/internal/services/materials"
	privacysvc "github.com/connor-davis/3reco/internal/services/privacy"
	profilesvc "github.com/connor-davis/3reco/internal/services/profile"
	"github.com/connor-davis/3reco/internal/services/realtime"
	requestssvc "github.com/connor-davis/3reco/internal/services/requests"
	statssvc "github.com/connor-davis/3reco/internal/services/stats"
	stocksvc "github.com/connor-davis/3reco/internal/services/stock"
	storessvc "github.com/connor-davis/3reco/internal/services/stores"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
	collectorsstore "github.com/connor-davis/3reco/internal/stores/collectors"
	marketstore "github.com/connor-davis/3reco/internal/stores/market"
	materialsstore "github.com/connor-davis/3reco/internal/stores/materials"
	privacystore "github.com/connor-davis/3reco/internal/stores/privacy"
	profilestore "github.com/connor-davis/3reco/internal/stores/profile"
	statsstore "github.com/connor-davis/3reco/internal/stores/stats"
	stockstore "github.com/connor-davis/3reco/internal/stores/stock"
	storesstore "github.com/connor-davis/3reco/internal/stores/stores"
)

// Module wires everything the server needs. The caller supplies config.Config
// and a connected *database.DB.
var Module = fx.Module("api",
	fx.Provide(
		crypt.FromConfig,
		mail.New,
		storage.New,
		authstore.New,
		auth.New,
		realtime.New,
		authapi.New,
		collectorsstore.New,
		collectorssvc.New,
		collectorsapi.New,
		marketstore.New,
		marketsvc.New,
		marketapi.New,
		materialsstore.New,
		materialssvc.New,
		materialsapi.New,
		statsstore.New,
		statssvc.New,
		statsapi.New,
		privacystore.New,
		privacysvc.New,
		privacyapi.New,
		profilestore.New,
		profilesvc.New,
		profileapi.New,
		stockstore.New,
		stocksvc.New,
		stockapi.New,
		storesstore.New,
		storessvc.New,
		storesapi.New,
		sockets.New,
		New,
		Listen,
	),
	tradeProviders,
	fx.Invoke(storageLifecycle),
	fx.Invoke(backfillPayoutLast4),
	fx.Invoke(background),
	fx.Invoke(func(*Listener) {}),
)

func storageLifecycle(lc fx.Lifecycle, objects *storage.Client) {
	lc.Append(fx.Hook{OnStart: objects.EnsureBucket})
}

// backfillPayoutLast4 fills the last four payout digits of collectors saved
// before the columns existed. It needs the key, so it runs here, not in SQL.
func backfillPayoutLast4(lc fx.Lifecycle, records *collectorsstore.Store) {
	lc.Append(fx.Hook{OnStart: func(ctx context.Context) error {
		filled, err := records.BackfillLast4(ctx)
		if err != nil {
			slog.Warn("payout last four not filled", "err", err)
		} else if filled > 0 {
			slog.Info("payout last four filled", "collectors", filled)
		}

		return nil
	}})
}

// routes is everything that registers routes under /api.
type routes struct {
	fx.In

	Config     config.Config
	DB         *database.DB
	Auth       *auth.Service
	AuthH      *authapi.Handler
	Socket     *sockets.Handler
	Collectors *collectorsapi.Handler
	Market     *marketapi.Handler
	Stats      *statsapi.Handler
	Materials  *materialsapi.Handler
	Privacy    *privacyapi.Handler
	Profile    *profileapi.Handler
	Stock      *stockapi.Handler
	Stores     *storesapi.Handler
	Trade      tradeRoutes
}

// New builds the Fiber app with every route.
func New(r routes) *fiber.App {
	cfg := r.Config

	app := fiber.New(fiber.Config{
		AppName:      "3reco",
		ErrorHandler: errorHandler,
		BodyLimit:    cfg.BodyLimit,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 2 * time.Minute,
		IdleTimeout:  2 * time.Minute,
		// c.IP() is the real client only when the proxy is trusted; anyone
		// else could fake X-Forwarded-For.
		TrustProxy:       len(cfg.TrustedProxies) > 0,
		TrustProxyConfig: fiber.TrustProxyConfig{Proxies: cfg.TrustedProxies},
		ProxyHeader:      proxyHeader(cfg.TrustedProxies),
	})

	// The logger goes first so it also sees the 500 when recover catches a panic.
	app.Use(requestLogger)
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(securityHeaders)

	api := app.Group("/api")

	api.Use(compress.New(compress.Config{Next: skipCompression}))

	api.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.WebOrigin},
		AllowCredentials: true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Idempotency-Key"},
	}))
	api.Use(middleware.CSRF(cfg))

	api.Get("/health", func(c fiber.Ctx) error {
		if err := r.DB.Pool.Ping(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "down"})
		}

		return c.JSON(fiber.Map{"status": "ok", "version": config.Version})
	})

	// Every /api request may carry a cookie; this loads who it belongs to, once.
	api.Use(middleware.Authenticate(r.Auth, cfg))

	// A guest cannot use anything but their own profile until setup is done.
	api.Use(middleware.RequireSetup)

	// Writes by a signed-in user share one transaction that names them.
	api.Use(middleware.ActorTx(r.DB))

	r.AuthH.Register(api.Group("/auth"))
	r.Socket.Register(api)
	r.Trade.register(api)
	r.Collectors.Register(api)
	r.Market.Register(api)
	r.Materials.Register(api)
	r.Stats.Register(api)
	r.Privacy.Register(api)
	r.Profile.Register(api)
	r.Stock.Register(api)
	r.Stores.Register(api)

	// Unknown /api paths get a JSON 404.
	api.Use(func(c fiber.Ctx) error { return apperr.NotFound("No such API endpoint.") })

	serveWeb(app, cfg.WebDist)

	return app
}

func proxyHeader(trusted []string) string {
	if len(trusted) == 0 {
		return ""
	}

	return fiber.HeaderXForwardedFor
}

func securityHeaders(c fiber.Ctx) error {
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("X-Frame-Options", "DENY")
	c.Set("Referrer-Policy", "same-origin")

	return c.Next()
}

func requestLogger(c fiber.Ctx) error {
	start := time.Now()
	err := c.Next()

	status := c.Response().StatusCode()
	if err != nil {
		status = errorStatus(err)
	}

	slog.Info("request",
		"method", c.Method(), "path", c.Path(), "status", status,
		"ms", time.Since(start).Milliseconds(), "id", requestid.FromContext(c))

	return err
}

func errorStatus(err error) int {
	var app *apperr.Error
	if errors.As(err, &app) {
		return app.Status
	}

	var fe *fiber.Error
	if errors.As(err, &fe) {
		return fe.Code
	}

	return fiber.StatusInternalServerError
}

// errorHandler turns any error into JSON. Expected errors keep their message;
// anything else is a bug, gets logged, and shows a plain 500 so no internals leak.
func errorHandler(c fiber.Ctx, err error) error {
	var app *apperr.Error
	if errors.As(err, &app) {
		return c.Status(app.Status).JSON(fiber.Map{
			"code": app.Code, "message": app.Message, "fields": app.Data,
		})
	}

	var fe *fiber.Error
	if errors.As(err, &fe) {
		return c.Status(fe.Code).JSON(fiber.Map{"code": "error", "message": fe.Message})
	}

	slog.Error("request failed",
		"method", c.Method(), "route", c.Path(), "id", requestid.FromContext(c), "err", err)

	return c.Status(fiber.StatusInternalServerError).
		JSON(fiber.Map{"code": "internal", "message": "Something went wrong on our side."})
}

// background starts the realtime hub and the hourly purge with the app.
func background(
	lc fx.Lifecycle,
	hub *realtime.Hub,
	a *auth.Service,
	requests *requestssvc.Service,
	market *marketsvc.Service,
	p *privacysvc.Service,
) {
	ctx, cancel := context.WithCancel(context.Background())

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			go hub.Run(ctx)
			go purgeLoop(ctx, a)
			go offerExpiryLoop(ctx, requests, market)
			go retentionLoop(ctx, p)

			return nil
		},
		OnStop: func(context.Context) error {
			cancel()

			return nil
		},
	})
}

// offerExpiryLoop frees ended offer holds and ended cart holds every 3 minutes.
func offerExpiryLoop(
	ctx context.Context,
	requests *requestssvc.Service,
	market *marketsvc.Service,
) {
	tick := time.NewTicker(3 * time.Minute)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err := requests.ExpireOffers(ctx); err != nil {
				slog.Warn("offer expiry failed", "err", err)
			}

			if err := market.ExpireCartHolds(ctx); err != nil {
				slog.Warn("cart expiry failed", "err", err)
			}
		}
	}
}

func purgeLoop(ctx context.Context, a *auth.Service) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err := a.Purge(ctx); err != nil {
				slog.Warn("purge failed", "err", err)
			}
		}
	}
}

// retentionLoop runs the privacy clean-up (old notifications, carts, trades)
// every hour. The first run waits an hour, like the session purge.
func retentionLoop(ctx context.Context, p *privacysvc.Service) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err := p.Retain(ctx); err != nil {
				slog.Warn("privacy retention failed", "err", err)
			}
		}
	}
}

// Listener is the open port. Tests ask it for the real address.
type Listener struct{ ln net.Listener }

// Addr is the host:port the server listens on.
func (l *Listener) Addr() string { return l.ln.Addr().String() }

// Listen opens the port at start and closes it at stop, waiting for requests.
func Listen(lc fx.Lifecycle, app *fiber.App, cfg config.Config) *Listener {
	l := &Listener{}

	lc.Append(fx.Hook{
		OnStart: func(context.Context) error {
			ln, err := net.Listen("tcp", cfg.Addr)
			if err != nil {
				return err
			}

			l.ln = ln

			go func() {
				err := app.Listener(ln, fiber.ListenConfig{DisableStartupMessage: true})
				if err != nil {
					slog.Error("server stopped", "err", err)
				}
			}()

			return nil
		},
		OnStop: func(context.Context) error {
			return app.ShutdownWithTimeout(cfg.ShutdownTimeout)
		},
	})

	return l
}

// skipCompression leaves the WebSocket and the streamed CSV, PDF and file
// downloads alone: they are already compact or must not be buffered.
func skipCompression(c fiber.Ctx) bool {
	path := c.Path()

	return path == "/api/live" ||
		strings.HasPrefix(path, "/api/admin/exports/") ||
		strings.HasPrefix(path, "/api/exports/") ||
		strings.HasSuffix(path, "/invoice") ||
		strings.Contains(path, "/receipts/") ||
		strings.HasSuffix(path, "/avatar")
}
