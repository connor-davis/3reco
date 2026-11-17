package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"

	"go.uber.org/fx"

	"github.com/connor-davis/3reco/internal/api"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/demo"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
	demostore "github.com/connor-davis/3reco/internal/stores/demo"
)

// demoCommand runs `3reco demo seed` or `3reco demo reset --yes`.
func demoCommand(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: 3reco demo seed | demo reset --yes")
	}

	switch args[0] {
	case "seed":
		return withDB(func(ctx context.Context, cfg config.Config, db *database.DB) error {
			return demoSeed(ctx, cfg, db)
		})
	case "reset":
		fs := flag.NewFlagSet("demo reset", flag.ContinueOnError)
		yes := fs.Bool("yes", false, "confirm the wipe")

		if err := fs.Parse(args[1:]); err != nil {
			return err
		}

		return withDB(func(ctx context.Context, cfg config.Config, db *database.DB) error {
			return demoReset(ctx, cfg, db, *yes)
		})
	}

	return fmt.Errorf("usage: 3reco demo seed | demo reset --yes")
}

// demoReset wipes the demo database and bucket and seeds them again. Stop the
// API first: the schema is dropped under it. Every guard must pass before any
// data is touched.
func demoReset(ctx context.Context, cfg config.Config, db *database.DB, yes bool) error {
	if !cfg.Demo {
		return fmt.Errorf("demo reset needs THREERECO_DEMO=true")
	}

	if err := cfg.CheckDemo(); err != nil {
		return err
	}

	fmt.Printf("demo reset: database %q, bucket %q\n", cfg.DatabaseName(), cfg.S3Bucket)

	if !yes {
		return fmt.Errorf("demo reset wipes that database and bucket: add --yes to go ahead")
	}

	objects, err := storage.New(cfg)
	if err != nil {
		return err
	}

	if err := objects.EnsureBucket(ctx); err != nil {
		return err
	}

	if err := objects.Clear(ctx); err != nil {
		return err
	}

	if err := demostore.New(db).ResetSchema(ctx); err != nil {
		return err
	}

	if err := database.Migrate(ctx, db); err != nil {
		return err
	}

	return demoSeed(ctx, cfg, db)
}

// demoSeed starts the API on a private port, fills the empty database through
// it, and stops it again. The private server may sign people in over plain
// HTTP and answer fast, so its cookie and rate-limit settings are loosened;
// nothing else about it differs.
func demoSeed(ctx context.Context, cfg config.Config, db *database.DB) error {
	if !cfg.Demo {
		return fmt.Errorf("demo seed needs THREERECO_DEMO=true")
	}

	if err := cfg.CheckDemo(); err != nil {
		return err
	}

	private := cfg
	private.Addr = "127.0.0.1:0"
	private.CookieSecure = false
	private.AuthRateLimit = 100000
	private.WebDist = os.TempDir() // no web app is needed here

	var listener *api.Listener

	app := fx.New(
		fx.NopLogger,
		fx.Supply(private, db),
		api.Module,
		fx.Populate(&listener),
	)

	if err := app.Err(); err != nil {
		return err
	}

	if err := app.Start(ctx); err != nil {
		return err
	}

	defer func() { _ = app.Stop(context.Background()) }()

	users := authstore.New(db)
	store := demostore.New(db)

	seeder := &demo.Seeder{
		Config:  private,
		BaseURL: "http://" + listener.Addr(),
		Auth:    auth.New(db, users, mail.New(private), private),
		Users:   users,
		Store:   store,
	}

	if err := seeder.Seed(ctx); err != nil {
		return err
	}

	counts, err := store.Counts(ctx)
	if err != nil {
		return err
	}

	names := make([]string, 0, len(counts))
	for name := range counts {
		names = append(names, name)
	}

	sort.Strings(names)

	for _, name := range names {
		fmt.Printf("%-14s %d\n", name, counts[name])
	}

	return nil
}
