// Command 3reco is the 3REco server and its helper commands:
//
//	3reco serve          run the API
//	3reco migrate        apply the SQL migrations and stop
//	3reco admin create   make (or promote) an admin: --email --password --name
//	3reco import-convex <export.zip>  load a Convex export into an empty database
//	3reco health         exit 0 when the local server answers (for Docker)
//	3reco version        print the version
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/lmittmann/tint"
	"go.uber.org/fx"

	"github.com/connor-davis/3reco/internal/api"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/importer"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return usage()
	}

	switch args[0] {
	case "version":
		fmt.Println(config.Version)

		return nil
	case "health":
		return health()
	case "serve":
		return serve()
	case "migrate":
		return withDB(func(ctx context.Context, _ config.Config, _ *database.DB) error {
			slog.Info("migrations are up to date")

			return nil
		})
	case "import-convex":
		return importConvex(args[1:])
	case "admin":
		if len(args) > 1 && args[1] == "create" {
			return adminCreate(args[2:])
		}
	}

	return usage()
}

func usage() error {
	return fmt.Errorf("usage: 3reco serve | migrate | admin create | import-convex <export.zip> | health | version")
}

// withDB loads the config, connects and migrates, then runs fn.
func withDB(fn func(context.Context, config.Config, *database.DB) error) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	setLogger(cfg)

	ctx := context.Background()

	db, err := database.Connect(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := database.Migrate(ctx, db); err != nil {
		return err
	}

	return fn(ctx, cfg, db)
}

func serve() error {
	return withDB(func(_ context.Context, cfg config.Config, db *database.DB) error {
		app := fx.New(
			fx.NopLogger,
			fx.StopTimeout(cfg.ShutdownTimeout+5*time.Second),
			fx.Supply(cfg, db),
			api.Module,
		)

		slog.Info("3reco starting", "addr", cfg.Addr, "version", config.Version)
		app.Run()

		return app.Err()
	})
}

func adminCreate(args []string) error {
	fs := flag.NewFlagSet("admin create", flag.ContinueOnError)
	email := fs.String("email", "", "admin email")
	password := fs.String("password", os.Getenv("THREERECO_ADMIN_PASSWORD"), "admin password")
	name := fs.String("name", "Admin", "display name")

	if err := fs.Parse(args); err != nil {
		return err
	}

	if *email == "" || *password == "" {
		return fmt.Errorf("--email and --password (or THREERECO_ADMIN_PASSWORD) are required")
	}

	return withDB(func(ctx context.Context, cfg config.Config, db *database.DB) error {
		svc := auth.New(db, authstore.New(db), mail.New(cfg), cfg)

		if err := svc.CreateAdmin(ctx, *name, *email, *password); err != nil {
			return err
		}

		fmt.Println("admin ready:", strings.ToLower(*email))

		return nil
	})
}

// importConvex loads a `npx convex export` ZIP into an empty database and
// MinIO. Stop the API first: the import should not run beside a live server.
func importConvex(args []string) error {
	fs := flag.NewFlagSet("import-convex", flag.ContinueOnError)

	if err := fs.Parse(args); err != nil {
		return err
	}

	if fs.NArg() != 1 {
		return fmt.Errorf("usage: 3reco import-convex <export.zip> (stop the API first)")
	}

	return withDB(func(ctx context.Context, cfg config.Config, db *database.DB) error {
		objects, err := storage.New(cfg)
		if err != nil {
			return err
		}

		report, err := importer.Run(ctx, db, objects, fs.Arg(0))
		if report != nil {
			report.Print(os.Stdout)
		}

		return err
	})
}

// health asks the local server for /api/health. A Docker HEALTHCHECK runs it.
func health() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	_, port, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return err
	}

	client := http.Client{Timeout: 3 * time.Second}

	resp, err := client.Get("http://127.0.0.1:" + port + "/api/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health answered %d", resp.StatusCode)
	}

	return nil
}

func setLogger(cfg config.Config) {
	if cfg.Dev {
		slog.SetDefault(slog.New(tint.NewTextHandler(os.Stderr, &tint.Options{TimeFormat: time.Kitchen})))

		return
	}

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, nil)))
}
