package tests

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/demo"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
	demostore "github.com/connor-davis/3reco/internal/stores/demo"
	"github.com/connor-davis/3reco/tests/testutil"
)

func demoSeeder(app *testutil.App) *demo.Seeder {
	users := authstore.New(app.DB)

	return &demo.Seeder{
		Config:  app.Config,
		BaseURL: app.URL,
		Auth:    auth.New(app.DB, users, mail.New(app.Config), app.Config),
		Users:   users,
		Store:   demostore.New(app.DB),
	}
}

func TestDemoSeedRefusedWhenFlagIsOff(t *testing.T) {
	app := testutil.Server(t)

	err := demoSeeder(app).Seed(context.Background())
	if err == nil || !strings.Contains(err.Error(), "THREERECO_DEMO") {
		t.Fatalf("seed without the flag: %v", err)
	}

	count, _ := demostore.New(app.DB).UserCount(context.Background())
	if count != 0 {
		t.Errorf("a refused seed still made %d users", count)
	}
}

func TestDemoSeedMakesTheExpectedData(t *testing.T) {
	app := demoServer(t)
	ctx := context.Background()
	seeder := demoSeeder(app)

	if err := seeder.Seed(ctx); err != nil {
		t.Fatalf("seed: %v", err)
	}

	counts, err := demostore.New(app.DB).Counts(ctx)
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]int{
		"users": 9, "businesses": 7, "materials": 12, "stock": 37, "requests": 9,
		"transactions": 11, "collectors": 3, "reviews": 8, "wanted": 1, "quick": 3,
	}

	for table, n := range want {
		if counts[table] != n {
			t.Errorf("%s: %d, want %d", table, counts[table], n)
		}
	}

	// Every address is fictional, and nobody has a login but the three.
	var strange, unverified int

	err = app.DB.Pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE email NOT LIKE '%@demo.test'),
			count(*) FILTER (WHERE NOT email_verified) FROM users`).Scan(&strange, &unverified)
	if err != nil || strange != 0 || unverified != 0 {
		t.Errorf("emails not @demo.test: %d, unverified: %d (%v)", strange, unverified, err)
	}

	var verified int

	_ = app.DB.Pool.QueryRow(ctx,
		`SELECT count(*) FROM businesses WHERE business_verified_at IS NOT NULL`).Scan(&verified)
	if verified != 7 {
		t.Errorf("verified businesses: %d, want 7", verified)
	}

	// Some listings name where to collect from.
	var areas int

	_ = app.DB.Pool.QueryRow(ctx,
		`SELECT count(*) FROM stock WHERE pickup_area <> ''`).Scan(&areas)
	if areas == 0 {
		t.Error("no listing has a pickup area")
	}

	// A second run refuses and adds nothing.
	if err := seeder.Seed(ctx); err == nil {
		t.Error("a second seed was allowed")
	}

	again, _ := demostore.New(app.DB).UserCount(ctx)
	if again != counts["users"] {
		t.Errorf("users after a refused second seed: %d, want %d", again, counts["users"])
	}
}

func TestDemoLoginsSignInAndSeeOnlyTheirOwn(t *testing.T) {
	app := demoServer(t)
	ctx := context.Background()

	if err := demoSeeder(app).Seed(ctx); err != nil {
		t.Fatalf("seed: %v", err)
	}

	roles := map[string]string{
		demo.BuyerEmail: "business", demo.SellerEmail: "business", demo.CollectorEmail: "collector",
	}

	clients := map[string]*testutil.Client{}

	for email, role := range roles {
		c := app.NewClient(t)

		if res := signIn(t, c, email, demo.Password); res.Status != 200 {
			t.Fatalf("%s sign-in: %d %s", email, res.Status, res.Raw)
		}

		me := c.Do("GET", "/api/auth/me", nil)

		user, _ := me.Body["user"].(map[string]any)
		if user["role"] != role {
			t.Errorf("%s role = %v, want %s", email, user["role"], role)
		}

		clients[email] = c
	}

	// A request between two other businesses is not readable by the buyer.
	var other string

	err := app.DB.Pool.QueryRow(ctx, `
		SELECT r.id FROM transaction_requests r
		WHERE r.buyer_id NOT IN (SELECT id FROM users WHERE email = $1)
		  AND r.seller_id NOT IN (SELECT id FROM users WHERE email = $1) LIMIT 1`,
		demo.BuyerEmail).Scan(&other)
	if err != nil {
		t.Fatal(err)
	}

	if res := clients[demo.BuyerEmail].Do("GET", "/api/requests/"+other, nil); res.Status < 400 {
		t.Errorf("buyer read someone else's request: %d %s", res.Status, res.Raw)
	}

	// The seller's quick replies are the seller's own.
	if res := clients[demo.BuyerEmail].Do("GET", "/api/quick-replies", nil); res.Status != 200 ||
		strings.Contains(string(res.Raw), "Friday morning") {
		t.Errorf("buyer sees the seller's replies: %d %s", res.Status, res.Raw)
	}

	// The collector sees the collection recorded against their own phone.
	if res := clients[demo.CollectorEmail].Do("GET", "/api/transactions", nil); res.Status != 200 {
		t.Errorf("collector transactions: %d %s", res.Status, res.Raw)
	}
}

// The web app holds the same logins as the seed. This keeps the two in step.
func TestDemoLoginsMatchTheWebApp(t *testing.T) {
	raw, err := os.ReadFile("../web/apps/app/src/lib/demo-logins.ts")
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{demo.BuyerEmail, demo.SellerEmail, demo.CollectorEmail, demo.Password} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("demo-logins.ts does not hold %q", want)
		}
	}
}
