package config

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// DatabaseName is the database in THREERECO_DATABASE_URL, or "" if the URL
// cannot be read.
func (c Config) DatabaseName() string {
	u, err := url.Parse(c.DatabaseURL)
	if err != nil {
		return ""
	}

	return strings.TrimPrefix(u.Path, "/")
}

// CheckDemo refuses a demo run that could touch real data or send real mail.
// It does nothing when the demo flag is off. The nightly reset wipes the
// database, so every check here must pass before it runs too.
func (c Config) CheckDemo() error {
	if !c.Demo {
		return nil
	}

	name := c.DatabaseName()

	switch {
	case !strings.HasSuffix(name, "_demo"):
		return fmt.Errorf("THREERECO_DEMO needs a database whose name ends in _demo, not %q", name)
	case !strings.Contains(c.S3Bucket, "demo"):
		return fmt.Errorf("THREERECO_DEMO needs a bucket with demo in its name, not %q", c.S3Bucket)
	case c.ResendAPIKey != "":
		return errors.New("THREERECO_DEMO must not have RESEND_API_KEY set: it could send real mail")
	case c.SMTPHost != "":
		return errors.New("THREERECO_DEMO must not have THREERECO_SMTP_HOST set")
	case c.Dev:
		return errors.New("THREERECO_DEMO cannot run in THREERECO_DEV mode")
	case strings.EqualFold(strings.TrimSpace(c.Geocoder), "nominatim"):
		return errors.New("THREERECO_DEMO must not enable Nominatim address lookup")
	case c.VAPIDPublicKey != "" || c.VAPIDPrivateKey != "":
		return errors.New("THREERECO_DEMO has phone alerts off: leave the VAPID keys empty")
	case c.FieldKey == "":
		return errors.New("THREERECO_DEMO needs its own THREERECO_FIELD_KEY")
	}

	return nil
}
