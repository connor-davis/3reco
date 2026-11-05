// Package invoices composes, stores and emails invoices after committed trades.
package invoices

import (
	"bytes"
	"context"
	"fmt"
	"html"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.uber.org/fx"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/mail"
	"github.com/connor-davis/3reco/internal/platform/pdf"
	"github.com/connor-davis/3reco/internal/platform/storage"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/privacy"
	"github.com/connor-davis/3reco/internal/services/transactions"
	pstore "github.com/connor-davis/3reco/internal/stores/privacy"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// Service owns invoice rendering and delivery.
type Service struct {
	db      *database.DB
	store   *store.Store
	objects *storage.Client
	mailer  *mail.Mailer
	trades  *transactions.Service
	audit   *pstore.Store
	pending sync.WaitGroup
}

// New wires the after-commit hook before requests can create trades.
func New(
	lifecycle fx.Lifecycle,
	db *database.DB,
	rows *store.Store,
	objects *storage.Client,
	mailer *mail.Mailer,
	trades *transactions.Service,
	audit *pstore.Store,
) *Service {
	service := &Service{
		db: db, store: rows, objects: objects, mailer: mailer, trades: trades, audit: audit,
	}
	trades.SetInvoiceHook(service.queue)
	lifecycle.Append(fx.Hook{OnStop: func(ctx context.Context) error {
		finished := make(chan struct{})
		go func() {
			service.pending.Wait()
			close(finished)
		}()

		select {
		case <-finished:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}})

	return service
}

func (s *Service) queue(id string, notify bool) {
	// ponytail: renders and mail are best effort after commit. Upgrade: a durable jobs table.
	s.pending.Add(1)
	go func() {
		defer s.pending.Done()
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()

		if err := s.Generate(ctx, id, notify); err != nil {
			slog.Error("invoice failed", "transaction", id, "err", err)
		}
	}()
}

// Name follows invoice/export display precedence, including legacy email fallback.
func Name(contact store.Contact) string {
	for _, name := range []string{
		contact.BusinessName, strings.TrimSpace(contact.FirstName + " " + contact.LastName),
		contact.Name, contact.Email,
	} {
		if name != "" {
			return name
		}
	}

	return "Unknown"
}

// Address joins only populated address parts.
func Address(contact store.Contact) string {
	parts := []string{contact.Street, contact.City, contact.Province}
	if contact.AreaCode != nil {
		parts = append(parts, strconv.Itoa(*contact.AreaCode))
	}

	return populated(parts, ", ")
}

// Payment uses the frozen collector payout when the read model contains a snapshot.
func Payment(contact store.Contact) (string, string) {
	if contact.PayoutMethod == "ewallet" && contact.Platform != "" && contact.PaymentID != "" {
		return "Ewallet", "Platform: " + contact.Platform + "\nPayment ID: " + contact.PaymentID
	}

	if contact.Holder != "" && contact.Bank != "" && contact.Account != "" &&
		contact.Branch != "" && contact.AccountType != "" {
		return "Bank transfer", "Account holder: " + contact.Holder + "\nBank: " + contact.Bank +
			"\nAccount number: " + contact.Account + "\nBranch code: " + contact.Branch +
			"\nAccount type: " + contact.AccountType
	}

	return "", "Payment details have not been provided. Please contact the seller."
}

func populated(parts []string, separator string) string {
	var out []string
	for _, part := range parts {
		if part != "" {
			out = append(out, part)
		}
	}

	return strings.Join(out, separator)
}

// Compose makes the immutable PDF input from the authorized internal read model.
func Compose(document store.Document) pdf.Invoice {
	trade := document.Trade
	_, payment := Payment(document.Seller)
	party := func(contact store.Contact) string {
		return populated([]string{Name(contact), contact.Email, contact.Phone, Address(contact)}, "\n")
	}

	kind := "Business to Business"
	if trade.Type == "c2b" {
		kind = "Collector to Business"
	}

	invoice := pdf.Invoice{
		Number: trade.InvoiceNumber,
		Date:   trade.EffectiveAt.In(time.FixedZone("SAST", 7200)).Format("2 January 2006"),
		Seller: party(document.Seller), Buyer: party(document.Buyer),
		Type: kind, Payment: payment, Total: pdf.Decimal(trade.TotalPrice),
	}
	for _, item := range trade.Items {
		invoice.Lines = append(invoice.Lines, pdf.Line{
			Material: item.MaterialName, Weight: pdf.Decimal(item.Weight),
			Price: pdf.Decimal(item.Price), Total: pdf.Product(item.Weight, item.Price),
		})
	}

	return invoice
}

// Generate stores a new unique render, replaces its reference atomically and optionally emails it.
func (s *Service) Generate(ctx context.Context, id string, notify bool) error {
	var document store.Document
	var data []byte
	var key string

	err := s.db.InTx(ctx, func(ctx context.Context) error {
		old, err := s.store.LockInvoice(ctx, id)
		if err != nil {
			return err
		}

		document, err = s.store.Document(ctx, id)
		if err != nil {
			return err
		}

		// Past the retention period the personal details are gone: nothing to render.
		if document.Anonymised {
			return nil
		}

		data, err = pdf.Render(Compose(document))
		if err != nil {
			return err
		}

		key = "invoices/" + id + "/" + database.NewID()
		if err := s.objects.Put(
			ctx,
			key,
			bytes.NewReader(data),
			int64(len(data)),
			"application/pdf",
		); err != nil {
			return err
		}

		if err := s.store.SetInvoice(ctx, id, key); err != nil {
			return err
		}

		if old != "" {
			s.objects.RemoveAfterCommit(ctx, old)
		}

		return nil
	})
	if err != nil {
		if key != "" {
			_ = s.objects.Remove(context.WithoutCancel(ctx), key)
		}

		return err
	}

	if notify && document.Buyer.Email != "" {
		invoice := Compose(document)
		body := fmt.Sprintf(
			"Your invoice is ready\n\nHi %s,\n\n"+
				"Please find your invoice %s dated %s attached to this email.\n\n"+
				"This invoice was generated automatically by 3rEco.",
			Name(document.Buyer),
			invoice.Number,
			invoice.Date,
		)

		return s.mailer.Send(ctx, mail.Message{
			To: document.Buyer.Email, Subject: "Your 3rEco invoice " + invoice.Number,
			Text: body, HTML: "<p>" + strings.ReplaceAll(html.EscapeString(body), "\n", "<br>") + "</p>",
			Attachments: []mail.Attachment{{
				Filename:    "3rEco-Invoice-" + invoice.Number + ".pdf",
				ContentType: "application/pdf",
				Content:     data,
			}},
		})
	}

	return nil
}

// Download checks read access and rebuilds a missing invoice without sending mail.
func (s *Service) Download(ctx context.Context, user auth.User, id string) (io.ReadCloser, string, error) {
	trade, err := s.trades.Detail(ctx, user, id)
	if err != nil {
		return nil, "", err
	}

	document, err := s.store.Document(ctx, id)
	if err != nil {
		return nil, "", err
	}

	if document.Anonymised {
		return nil, "", apperr.NotFound("That invoice is no longer kept.")
	}

	// The PDF shows the seller's full account number: an admin read is audited.
	if auth.HasRole(user, "admin") && document.Seller.Account != "" {
		err := s.audit.Record(ctx, user.ID, "", privacy.KindAdminFullView)
		if err != nil {
			return nil, "", err
		}
	}

	if document.InvoiceKey != "" {
		reader, err := s.objects.Get(ctx, document.InvoiceKey)
		if err == nil {
			return reader, trade.InvoiceNumber, nil
		}
	}

	if err := s.Generate(ctx, id, false); err != nil {
		return nil, "", err
	}

	document, err = s.store.Document(ctx, id)
	if err != nil {
		return nil, "", err
	}

	reader, err := s.objects.Get(ctx, document.InvoiceKey)

	return reader, trade.InvoiceNumber, err
}
