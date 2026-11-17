// Package push sends phone alerts (web push). A notification row already
// exists by the time it is sent, so a failed push never costs the person the
// in-app alert.
package push

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	store "github.com/connor-davis/3reco/internal/stores/push"
)

// Sender delivers one encrypted payload to one browser. Tests swap in a fake.
// The status is the push service's HTTP status; 404 and 410 mean the browser
// is gone.
type Sender interface {
	Send(ctx context.Context, sub store.Subscription, payload []byte) (status int, err error)
}

// Service owns validation, caller scope and sending.
type Service struct {
	cfg   config.Config
	store *store.Store
	slots chan struct{}

	mu     sync.RWMutex
	sender Sender
}

// New builds the service. With no VAPID keys it stays off.
func New(cfg config.Config, rows *store.Store) *Service {
	return &Service{
		cfg: cfg, store: rows, sender: vapidSender{cfg: cfg}, slots: make(chan struct{}, 8),
	}
}

// SetSender swaps the sender (for tests).
func (s *Service) SetSender(sender Sender) {
	s.mu.Lock()
	s.sender = sender
	s.mu.Unlock()
}

// Enabled is true when both VAPID keys are set. The demo site never sends
// phone alerts, whatever the keys say.
func (s *Service) Enabled() bool {
	return !s.cfg.Demo && s.cfg.VAPIDPublicKey != "" && s.cfg.VAPIDPrivateKey != ""
}

// PublicKey is the key a browser needs to subscribe. It is empty when push is off.
func (s *Service) PublicKey() string {
	if !s.Enabled() {
		return ""
	}

	return s.cfg.VAPIDPublicKey
}

// Input is the subscription a browser makes (PushSubscription.toJSON()).
type Input struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

var keyText = regexp.MustCompile(`^[A-Za-z0-9_-]{8,200}={0,2}$`)

// Subscribe saves the browser for the calling person.
func (s *Service) Subscribe(ctx context.Context, userID string, in Input) error {
	if !s.Enabled() {
		return apperr.Conflict("Phone alerts are not set up on this server.")
	}

	if err := checkEndpoint(in.Endpoint); err != nil {
		return err
	}

	if !keyText.MatchString(in.Keys.P256dh) || !keyText.MatchString(in.Keys.Auth) {
		return apperr.Field("keys", "This browser sent a bad key.")
	}

	return s.store.Save(ctx, userID, store.Subscription{
		Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth,
	})
}

// Unsubscribe removes the calling person's subscription for the endpoint.
// Someone else's endpoint is quietly left alone.
func (s *Service) Unsubscribe(ctx context.Context, userID, endpoint string) error {
	if err := checkEndpoint(endpoint); err != nil {
		return err
	}

	return s.store.Remove(ctx, userID, endpoint)
}

func checkEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || len(endpoint) > 2048 || u.Scheme != "https" || u.Host == "" {
		return apperr.Field("endpoint", "This browser sent a bad address.")
	}

	return nil
}

// payload is what the service worker shows. Link is a same-origin path or empty.
type payload struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Body  string `json:"body"`
	Link  string `json:"link"`
}

// Notify sends the phone alert for one stored notification. It returns at once;
// the work runs in the background and only logs failures.
func (s *Service) Notify(id string) {
	if !s.Enabled() {
		return
	}

	go func() {
		s.slots <- struct{}{}
		defer func() { <-s.slots }()

		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		if err := s.send(ctx, id); err != nil {
			slog.Warn("phone alert failed", "notification", id, "err", err)
		}
	}()
}

func (s *Service) send(ctx context.Context, id string) error {
	msg, subs, ok, err := s.store.Message(ctx, id)
	if err != nil || !ok || len(subs) == 0 {
		return err
	}

	body, err := json.Marshal(payload{
		ID: id, Title: msg.Title, Body: msg.Body, Link: samePath(msg.Link),
	})
	if err != nil {
		return err
	}

	s.mu.RLock()
	sender := s.sender
	s.mu.RUnlock()

	for _, sub := range subs {
		status, err := sender.Send(ctx, sub, body)

		// The push service says this browser is gone for good.
		if status == http.StatusNotFound || status == http.StatusGone {
			if err := s.store.RemoveEndpoint(ctx, sub.Endpoint); err != nil {
				slog.Warn("dead subscription not removed", "err", err)
			}

			continue
		}

		if err != nil || status >= 300 {
			slog.Warn("phone alert not delivered", "status", status, "err", err)
		}
	}

	return nil
}

// samePath keeps only a path inside this app; anything else would let an alert
// open another site.
func samePath(link string) string {
	if !strings.HasPrefix(link, "/") || strings.HasPrefix(link, "//") || strings.Contains(link, `\`) {
		return ""
	}

	return link
}

// vapidSender is the real sender: webpush-go does the encryption and signing.
type vapidSender struct{ cfg config.Config }

func (v vapidSender) Send(ctx context.Context, sub store.Subscription, body []byte) (int, error) {
	resp, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      v.cfg.VAPIDSubject,
		VAPIDPublicKey:  v.cfg.VAPIDPublicKey,
		VAPIDPrivateKey: v.cfg.VAPIDPrivateKey,
		TTL:             24 * 60 * 60,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	return resp.StatusCode, nil
}
