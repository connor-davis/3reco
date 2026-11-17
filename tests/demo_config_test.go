package tests

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/tests/testutil"
)

// goodDemoConfig is a config that passes every demo check.
func goodDemoConfig() config.Config {
	return config.Config{
		Demo:        true,
		DatabaseURL: "postgres://u:p@db:5432/threereco_demo?sslmode=disable",
		S3Bucket:    "threereco-demo",
		FieldKey:    testutil.FieldKey,
	}
}

func TestDemoStartGuards(t *testing.T) {
	if err := goodDemoConfig().CheckDemo(); err != nil {
		t.Fatalf("a good demo config was refused: %v", err)
	}

	refused := map[string]func(*config.Config){
		"resend key":      func(c *config.Config) { c.ResendAPIKey = "re_live" },
		"smtp host":       func(c *config.Config) { c.SMTPHost = "mail.example.com" },
		"real database":   func(c *config.Config) { c.DatabaseURL = "postgres://u:p@db/threereco" },
		"bad database":    func(c *config.Config) { c.DatabaseURL = "::not a url" },
		"real bucket":     func(c *config.Config) { c.S3Bucket = "threereco" },
		"dev mode":        func(c *config.Config) { c.Dev = true },
		"push key":        func(c *config.Config) { c.VAPIDPublicKey = "key" },
		"no field key":    func(c *config.Config) { c.FieldKey = "" },
		"private vapid":   func(c *config.Config) { c.VAPIDPrivateKey = "key" },
		"database suffix": func(c *config.Config) { c.DatabaseURL = "postgres://u:p@db/demo_threereco" },
	}

	for name, change := range refused {
		cfg := goodDemoConfig()
		change(&cfg)

		if err := cfg.CheckDemo(); err == nil {
			t.Errorf("%s: demo start was allowed", name)
		}
	}

	// With the flag off nothing is checked, so production keeps working.
	live := goodDemoConfig()
	live.Demo = false
	live.ResendAPIKey = "re_live"
	live.DatabaseURL = "postgres://u:p@db/threereco"
	live.S3Bucket = "threereco"

	if err := live.CheckDemo(); err != nil {
		t.Errorf("a normal config was refused: %v", err)
	}
}

func TestDemoFlagIsListed(t *testing.T) {
	for _, v := range config.EnvVars {
		if v.Name == "THREERECO_DEMO" {
			return
		}
	}

	t.Error("THREERECO_DEMO is missing from config.EnvVars")
}

func TestDemoMailIsLoggedNotSent(t *testing.T) {
	var logs bytes.Buffer

	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	// SMTP is set on purpose: a real mailer would deliver to Mailpit.
	cfg := config.Config{
		Demo: true, SMTPHost: "localhost", SMTPPort: 1026, FromEmail: "3rEco <no-reply@localhost>",
	}
	to := testutil.Email("demo-mail")

	err := mail.New(cfg).Send(context.Background(), mail.Message{
		To: to, Subject: "Demo subject line", Text: "hi", HTML: "<p>hi</p>",
	})
	if err != nil {
		t.Fatalf("demo send: %v", err)
	}

	if !testutil.NoMail(t, to) {
		t.Error("a demo send reached Mailpit")
	}

	if !strings.Contains(logs.String(), "Demo subject line") {
		t.Errorf("the subject was not logged: %s", logs.String())
	}

	if strings.Contains(logs.String(), to) {
		t.Errorf("the address was logged: %s", logs.String())
	}
}

func TestMailStillSendsWhenDemoIsOff(t *testing.T) {
	cfg := config.Config{
		SMTPHost: "localhost", SMTPPort: 1026, FromEmail: "3rEco <no-reply@localhost>",
	}
	to := testutil.Email("live-mail")

	err := mail.New(cfg).Send(context.Background(), mail.Message{
		To: to, Subject: "Live subject line", Text: "hi", HTML: "<p>hi</p>",
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}

	testutil.WaitMail(t, to, "Live subject line")
}
