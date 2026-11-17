// Package certificates builds recycling records: a PDF of the reported weights of
// completed trades, from one trade or from a period. Nothing is stored; every
// download is built from the trade rows as they are now.
package certificates

import (
	"context"
	"math/big"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/pdf"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/transactions"
	store "github.com/connor-davis/3reco/internal/stores/transactions"
)

// methodLine tells the reader how the carbon figure is worked out.
const methodLine = "Carbon saved = weight (kg) × the material's carbon factor in 3REco today."

var headers = []string{"Material", "Bought (kg)", "Sold (kg)", "Carbon saved (kg)"}

// Service builds recycling records.
type Service struct {
	trades *transactions.Service
	store  *store.Store
}

// New builds the service.
func New(trades *transactions.Service, rows *store.Store) *Service {
	return &Service{trades: trades, store: rows}
}

// Trade renders the record of one completed trade the caller may read. Anyone else
// gets the same 404 as for an id that does not exist. It returns the PDF and the
// file name to save it under.
func (s *Service) Trade(ctx context.Context, user auth.User, id string) ([]byte, string, error) {
	trade, err := s.trades.Detail(ctx, user, id)
	if err != nil {
		return nil, "", err
	}

	if trade.Status != "complete" {
		return nil, "", apperr.NotFound("Recycling record not found.")
	}

	// Read the weights from the caller's side. Admin and staff are on neither side,
	// so they see the trade from the buyer's.
	_, owner, err := s.trades.OwnTrades(ctx, user)
	if err != nil && !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
		return nil, "", err
	}

	name := trade.Seller.Name
	if owner != trade.Buyer.ID && owner != trade.Seller.ID {
		owner = trade.Buyer.ID
	}

	if owner == trade.Buyer.ID {
		name = trade.Buyer.Name
	}

	lines, err := s.store.TradeImpact(ctx, trade.ID, owner)
	if err != nil {
		return nil, "", err
	}

	data, err := pdf.RenderCertificate(pdf.Certificate{
		Subtitle: trade.InvoiceNumber + " | " + transactions.DayLabel(trade.EffectiveAt),
		Kind:     "One completed trade",
		Details: []pdf.Detail{
			{Label: "RECORD FOR", Text: name},
			{Label: "ISSUED BY", Text: issuedBy(user)},
			{Label: "SELLER", Text: trade.Seller.Name},
			{Label: "BUYER", Text: trade.Buyer.Name},
		},
		Headers: headers,
		Rows:    rows(lines),
		Total:   total(lines),
		Method:  methodLine,
	})

	return data, "3REco-Recycling-Record-" + trade.InvoiceNumber + ".pdf", err
}

// Period renders the record of the caller's own completed trades, bought and sold,
// on the days from through to (both included, South African days). It never reads
// anyone else's trades.
func (s *Service) Period(ctx context.Context, user auth.User, from, to string) ([]byte, string, error) {
	start, end, err := transactions.DayRange(from, to)
	if err != nil {
		return nil, "", err
	}

	scope, owner, err := s.trades.OwnTrades(ctx, user)
	if err != nil {
		return nil, "", err
	}

	var lines []store.ImpactLine
	if owner != "" {
		lines, err = s.store.PeriodImpact(ctx, scope, owner, start, end)
		if err != nil {
			return nil, "", err
		}
	}

	if len(lines) == 0 {
		return nil, "", apperr.NotFound("You have no completed trades in those dates.")
	}

	name := user.Name
	if auth.PartyID(user) != "" && user.BusinessName != nil && *user.BusinessName != "" {
		name = *user.BusinessName
	}

	data, err := pdf.RenderCertificate(pdf.Certificate{
		Subtitle: from + " to " + to,
		Kind:     "Completed trades in a period",
		Details: []pdf.Detail{
			{Label: "RECORD FOR", Text: name},
			{Label: "ISSUED BY", Text: issuedBy(user)},
			{Label: "PERIOD", Text: day(start) + " to " + day(end.AddDate(0, 0, -1))},
		},
		Headers: headers,
		Rows:    rows(lines),
		Total:   total(lines),
		Method:  methodLine,
	})

	return data, "3REco-Recycling-Record-" + from + "-to-" + to + ".pdf", err
}

func day(moment time.Time) string { return transactions.DayLabel(moment) }

// issuedBy names the person who asked for the record and the day they did.
func issuedBy(user auth.User) string {
	return user.Name + "\n" + day(time.Now())
}

func rows(lines []store.ImpactLine) [][]string {
	out := make([][]string, 0, len(lines))
	for _, line := range lines {
		out = append(out, []string{
			line.Material, show(line.Bought), show(line.Sold), show(line.Carbon),
		})
	}

	return out
}

func total(lines []store.ImpactLine) []string {
	var bought, sold, carbon []string
	for _, line := range lines {
		bought, sold, carbon = append(bought, line.Bought), append(sold, line.Sold), append(carbon, line.Carbon)
	}

	return []string{"Total", show(sum(bought)), show(sum(sold)), show(sum(carbon))}
}

func show(value string) string { return pdf.Grouped(pdf.Weight(value)) }

// sum adds exact decimal strings without floats and keeps the longest fraction, so
// nothing is rounded.
func sum(values []string) string {
	total, digits := new(big.Rat), 0
	for _, value := range values {
		number, ok := new(big.Rat).SetString(value)
		if !ok {
			continue
		}

		total.Add(total, number)
		_, fraction, _ := strings.Cut(value, ".")
		digits = max(digits, len(fraction))
	}

	return total.FloatString(digits)
}
