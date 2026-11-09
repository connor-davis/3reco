// Package config reads every setting from environment variables. The list
// in EnvVars is the single source: usage text and docs/operate.md follow it.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version is set at build time with -ldflags "-X .../config.Version=v1.2.3".
var Version = "dev"

// Config holds the settings for one run of the server.
type Config struct {
	Addr            string
	DatabaseURL     string
	WebOrigin       string
	WebDist         string
	Dev             bool
	CookieSecure    bool
	TrustedProxies  []string
	AuthRateLimit   int
	DBMaxConns      int
	ShutdownTimeout time.Duration
	BodyLimit       int
	// FieldKey is the base64 key that seals ID and account numbers. It is
	// checked when the server starts, not here, so `health` still works.
	FieldKey string

	SMTPHost     string
	SMTPPort     int
	ResendAPIKey string
	ResendURL    string
	FromEmail    string

	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3Region    string
	S3UseTLS    bool
}

// EnvVar documents one setting.
type EnvVar struct {
	Name    string
	Default string
	Help    string
}

// EnvVars lists every environment variable the server reads.
var EnvVars = []EnvVar{
	{"THREERECO_ADDR", ":8180", "Address the API listens on."},
	{"THREERECO_DATABASE_URL", "postgres://threereco:threereco@localhost:5441/threereco?sslmode=disable", "Postgres connection string."},
	{"THREERECO_WEB_ORIGIN", "http://localhost:5173", "Origin of the web app. Used for CORS, CSRF, WebSockets and email links."},
	{"THREERECO_WEB_DIST", "web/apps/app/dist", "Folder with the built web app. The server serves it next to /api; if it is missing, only the API runs."},
	{"THREERECO_DEV", "false", "Dev mode: coloured logs, and mail goes to Mailpit when no Resend key is set."},
	{"THREERECO_COOKIE_SECURE", "false", "Set true in production so session cookies are HTTPS only."},
	{"THREERECO_TRUSTED_PROXIES", "", "Comma-separated proxy addresses whose X-Forwarded-For is believed."},
	{"THREERECO_AUTH_RATE_LIMIT", "20", "Requests per minute, per address, on each auth route."},
	{"THREERECO_DB_MAX_CONNS", "25", "Largest Postgres pool."},
	{"THREERECO_SHUTDOWN_TIMEOUT", "15s", "How long to wait for requests to finish on stop."},
	{"THREERECO_BODY_LIMIT", "10485760", "Largest request body in bytes."},
	{"THREERECO_FIELD_KEY", "", "Required. Base64 of 32 random bytes; seals ID numbers, account numbers and ewallet ids. Losing it loses those fields."},
	{"THREERECO_SMTP_HOST", "", "SMTP host (Mailpit locally). Empty means no SMTP unless dev."},
	{"THREERECO_SMTP_PORT", "1026", "SMTP port."},
	{"RESEND_API_KEY", "", "Resend API key. When set, mail goes through Resend."},
	{"THREERECO_RESEND_URL", "https://api.resend.com", "Resend API base URL (tests point it at a fake)."},
	{"AUTH_FROM_EMAIL", "3rEco <no-reply@localhost>", "The From address on every email."},
	{"THREERECO_S3_ENDPOINT", "localhost:9010", "MinIO or S3 host and port, with no scheme."},
	{"THREERECO_S3_BUCKET", "threereco", "Bucket for uploaded files."},
	{"THREERECO_S3_ACCESS_KEY", "threereco", "S3 access key."},
	{"THREERECO_S3_SECRET_KEY", "threereco-secret", "S3 secret key."},
	{"THREERECO_S3_REGION", "us-east-1", "S3 region."},
	{"THREERECO_S3_TLS", "false", "Use HTTPS to reach S3."},
}

// Load reads the environment. It fails on a value it cannot read.
func Load() (Config, error) {
	cfg := Config{
		Addr:           Env("THREERECO_ADDR", ":8180"),
		DatabaseURL:    Env("THREERECO_DATABASE_URL", EnvVars[1].Default),
		WebOrigin:      strings.TrimRight(Env("THREERECO_WEB_ORIGIN", "http://localhost:5173"), "/"),
		WebDist:        Env("THREERECO_WEB_DIST", "web/apps/app/dist"),
		Dev:            envBool("THREERECO_DEV"),
		CookieSecure:   envBool("THREERECO_COOKIE_SECURE"),
		TrustedProxies: envList("THREERECO_TRUSTED_PROXIES"),
		FieldKey:       Env("THREERECO_FIELD_KEY", ""),
		SMTPHost:       Env("THREERECO_SMTP_HOST", ""),
		ResendAPIKey:   Env("RESEND_API_KEY", ""),
		ResendURL:      Env("THREERECO_RESEND_URL", "https://api.resend.com"),
		FromEmail:      Env("AUTH_FROM_EMAIL", "3rEco <no-reply@localhost>"),
		S3Endpoint:     Env("THREERECO_S3_ENDPOINT", "localhost:9010"),
		S3Bucket:       Env("THREERECO_S3_BUCKET", "threereco"),
		S3AccessKey:    Env("THREERECO_S3_ACCESS_KEY", "threereco"),
		S3SecretKey:    Env("THREERECO_S3_SECRET_KEY", "threereco-secret"),
		S3Region:       Env("THREERECO_S3_REGION", "us-east-1"),
		S3UseTLS:       envBool("THREERECO_S3_TLS"),
	}

	var err error

	if cfg.AuthRateLimit, err = envInt("THREERECO_AUTH_RATE_LIMIT", 20); err != nil {
		return cfg, err
	}

	if cfg.DBMaxConns, err = envInt("THREERECO_DB_MAX_CONNS", 25); err != nil {
		return cfg, err
	}

	if cfg.BodyLimit, err = envInt("THREERECO_BODY_LIMIT", 10<<20); err != nil {
		return cfg, err
	}

	if cfg.SMTPPort, err = envInt("THREERECO_SMTP_PORT", 1026); err != nil {
		return cfg, err
	}

	raw := Env("THREERECO_SHUTDOWN_TIMEOUT", "15s")
	if cfg.ShutdownTimeout, err = time.ParseDuration(raw); err != nil {
		return cfg, fmt.Errorf("THREERECO_SHUTDOWN_TIMEOUT: %w", err)
	}

	return cfg, nil
}

// Env returns the variable, or fallback when it is unset or empty.
func Env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}

	return fallback
}

func envBool(key string) bool {
	v, _ := strconv.ParseBool(Env(key, "false"))

	return v
}

func envInt(key string, fallback int) (int, error) {
	raw := Env(key, "")
	if raw == "" {
		return fallback, nil
	}

	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be a whole number: %w", key, err)
	}

	return n, nil
}

func envList(key string) []string {
	var out []string

	for _, part := range strings.Split(Env(key, ""), ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}

	return out
}
