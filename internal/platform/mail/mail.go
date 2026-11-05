// Package mail sends email: through Resend in production, and over plain SMTP
// to Mailpit in development.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/config"
)

// Message is one email with a text and an HTML body.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Mailer sends messages. Build it with New.
type Mailer struct {
	cfg    config.Config
	client *http.Client
}

// New builds a Mailer from the config.
func New(cfg config.Config) *Mailer {
	return &Mailer{
		cfg: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
			// A Resend call never needs a redirect, so don't follow one.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

// Send delivers the message and waits for the answer.
func (m *Mailer) Send(ctx context.Context, msg Message) error {
	switch {
	case m.cfg.ResendAPIKey != "":
		return m.sendResend(ctx, msg)
	case m.smtpHost() != "":
		return m.sendSMTP(msg)
	}

	return errors.New("email is not set up: set RESEND_API_KEY or THREERECO_SMTP_HOST")
}

// SendAsync delivers the message in the background so a slow mail server
// never holds up a web request. A failure is logged only.
//
// ponytail: no retry queue, so a message lost to a restart or a mail outage is
// gone; the user's way out is the "resend" button. Upgrade: a jobs table.
func (m *Mailer) SendAsync(msg Message) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		if err := m.Send(ctx, msg); err != nil {
			slog.Error("email not sent", "subject", msg.Subject, "err", err)
		}
	}()
}

// smtpHost is the SMTP server to use: the configured one, or Mailpit on this
// machine in dev mode.
func (m *Mailer) smtpHost() string {
	if m.cfg.SMTPHost != "" {
		return m.cfg.SMTPHost
	}

	if m.cfg.Dev {
		return "localhost"
	}

	return ""
}

func (m *Mailer) sendResend(ctx context.Context, msg Message) error {
	body, err := json.Marshal(map[string]any{
		"from":    m.cfg.FromEmail,
		"to":      []string{msg.To},
		"subject": msg.Subject,
		"html":    msg.HTML,
		"text":    msg.Text,
	})
	if err != nil {
		return err
	}

	url := strings.TrimRight(m.cfg.ResendURL, "/") + "/emails"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+m.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode/100 != 2 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

		return fmt.Errorf("resend answered %d: %s", resp.StatusCode, detail)
	}

	return nil
}

// sendSMTP speaks plain SMTP with no login: that is Mailpit. Production uses Resend.
func (m *Mailer) sendSMTP(msg Message) error {
	from, err := mail.ParseAddress(m.cfg.FromEmail)
	if err != nil {
		return fmt.Errorf("AUTH_FROM_EMAIL: %w", err)
	}

	boundary := "3reco-" + strconv.FormatInt(time.Now().UnixNano(), 36)

	var buf bytes.Buffer

	fmt.Fprintf(&buf, "From: %s\r\n", from.String())
	fmt.Fprintf(&buf, "To: %s\r\n", msg.To)
	fmt.Fprintf(&buf, "Subject: %s\r\n", encodeHeader(msg.Subject))
	fmt.Fprintf(&buf, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprint(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=%s\r\n\r\n", boundary)
	writePart(&buf, boundary, "text/plain", msg.Text)
	writePart(&buf, boundary, "text/html", msg.HTML)
	fmt.Fprintf(&buf, "--%s--\r\n", boundary)

	addr := net.JoinHostPort(m.smtpHost(), strconv.Itoa(m.cfg.SMTPPort))

	return smtp.SendMail(addr, nil, from.Address, []string{msg.To}, buf.Bytes())
}

func writePart(buf *bytes.Buffer, boundary, kind, body string) {
	fmt.Fprintf(buf, "--%s\r\nContent-Type: %s; charset=utf-8\r\n", boundary, kind)
	fmt.Fprint(buf, "Content-Transfer-Encoding: 8bit\r\n\r\n")
	fmt.Fprint(buf, strings.ReplaceAll(body, "\n", "\r\n"), "\r\n")
}

func encodeHeader(value string) string { return mime.QEncoding.Encode("utf-8", value) }

// ActionEmail builds the standard "title, text, button, plain link" message
// used for verification and password reset. Colours match the old emails.
func ActionEmail(to, subject, title, body, button, link string) Message {
	page := fmt.Sprintf(`
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 12px;">%s</h2>
      <p style="margin-bottom: 20px;">%s</p>
      <p style="margin-bottom: 20px;">
        <a href="%s" style="display: inline-block; padding: 12px 18px; border-radius: 9999px; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600;">
          %s
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">If the button does not work, copy and paste this URL into your browser:</p>
      <p style="color: #0f766e; font-size: 14px; word-break: break-all;">%s</p>
    </div>
  `, html.EscapeString(title), html.EscapeString(body), html.EscapeString(link),
		html.EscapeString(button), html.EscapeString(link))

	return Message{
		To:      to,
		Subject: subject,
		Text:    title + "\n\n" + body + "\n\n" + button + ": " + link + "\n",
		HTML:    page,
	}
}
