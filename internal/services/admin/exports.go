package admin

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/pdf"
	"github.com/connor-davis/3reco/internal/services/auth"
	"github.com/connor-davis/3reco/internal/services/invoices"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
)

var transactionColumns = []string{
	"Transaction ID", "Transaction Type", "Transaction Date", "Recorded At", "Collection Day",
	"Items Count", "Materials", "Total Weight (kg)", "Total Price (R)", "Seller Name", "Seller Email",
	"Seller Phone", "Seller Address", "Buyer Name", "Buyer Email", "Buyer Phone", "Buyer Address",
	"Collector Payout Method", "Collector Payout Details",
}

var userColumns = []string{
	"Email", "Account Type", "First Name", "Last Name", "Business Name", "Business Reg. No.", "Phone",
	"Street Address", "City", "Area Code", "Province", "Registered At",
}

// Export is a validated export request. Write streams rows into the HTTP response.
type Export struct {
	Filename string
	Write    func(context.Context, io.Writer) error
}

// PrepareExport checks scope and timestamps before the HTTP response starts.
func (s *Service) PrepareExport(
	user auth.User,
	kind, rawFrom, rawTo, rawItemised string,
) (Export, error) {
	var empty Export
	scope, owner, tradeType := tstore.ScopeAll, user.ID, ""
	denied := apperr.Forbidden("You are not allowed to export these records.")

	switch kind {
	case "users":
		if !auth.HasRole(user, auth.RoleAdmin) {
			return empty, denied
		}
	case "transactions":
		if !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
			return empty, denied
		}
	case "collections":
		tradeType = "c2b"
		if !auth.HasRole(user, auth.RoleAdmin, auth.RoleStaff) {
			if !auth.HasRole(user, auth.RoleBusiness) {
				return empty, denied
			}

			scope = tstore.ScopePurchases
		}
	case "purchases", "sales":
		if !auth.HasRole(user, auth.RoleBusiness) {
			return empty, denied
		}

		scope = tstore.ScopePurchases
		if kind == "sales" {
			scope = tstore.ScopeBusinessSales
		}
	default:
		return empty, denied
	}

	var from, to *time.Time
	for i, raw := range []string{rawFrom, rawTo} {
		if raw == "" {
			continue
		}

		value, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return empty, apperr.BadRequest("Use RFC3339 timestamps for from and to.", nil)
		}

		if i == 0 {
			from = &value
		} else {
			to = &value
		}
	}

	if from != nil && to != nil && to.Before(*from) {
		return empty, apperr.BadRequest("The end must be on or after the start.", nil)
	}
	if rawItemised != "" && rawItemised != "true" && rawItemised != "false" {
		return empty, apperr.Field("itemised", "Use true or false.")
	}

	itemised := rawItemised == "true"
	return Export{Filename: kind + ".csv", Write: func(ctx context.Context, output io.Writer) error {
		writer := csv.NewWriter(output)
		write := func(cells []string) error {
			for i, cell := range cells {
				if strings.HasPrefix(cell, "=") || strings.HasPrefix(cell, "+") ||
					strings.HasPrefix(cell, "-") || strings.HasPrefix(cell, "@") {
					cells[i] = "'" + cell
				}
			}

			if err := writer.Write(cells); err != nil {
				return err
			}
			writer.Flush()

			return writer.Error()
		}

		if kind == "users" {
			if err := write(append([]string{}, userColumns...)); err != nil {
				return err
			}

			return s.store.ExportUsers(ctx, write)
		}

		header := append([]string{}, transactionColumns[:6]...)
		if itemised {
			header = append(
				header,
				"Line No",
				"Material",
				"Line Weight (kg)",
				"Unit Price (R)",
				"Line Total (R)",
			)
		} else {
			header = append(header, "Materials")
		}
		header = append(header, transactionColumns[7:]...)
		if err := write(header); err != nil {
			return err
		}

		return s.trades.ExportIDs(ctx, scope, owner, tradeType, from, to, func(id string) error {
			document, err := s.trades.Document(ctx, id)
			if err != nil {
				return err
			}

			for _, row := range exportRows(document, itemised) {
				if err := write(row); err != nil {
					return err
				}
			}

			return nil
		})
	}}, nil
}

func exportRows(document tstore.Document, itemised bool) [][]string {
	trade, seller, buyer := document.Trade, document.Seller, document.Buyer
	invoice := invoices.Compose(document)
	day := ""
	if trade.CollectionDay != nil {
		day = *trade.CollectionDay
	}

	prefix := []string{trade.ID, invoice.Type, trade.EffectiveAt.In(sast).Format("02/01/2006"),
		trade.CreatedAt.In(sast).Format("02/01/2006 15:04"), day, strconv.Itoa(len(trade.Items))}
	weight := new(big.Rat)
	var materials []string
	for i, line := range trade.Items {
		value, ok := new(big.Rat).SetString(line.Weight)
		if ok {
			weight.Add(weight, value)
		}

		materials = append(materials, fmt.Sprintf("%d. %s - %s kg x R %s = R %s",
			i+1, line.MaterialName, pdf.Decimal(line.Weight), pdf.Decimal(line.Price),
			pdf.Product(line.Weight, line.Price)))
	}

	method, payout := "", ""
	if trade.Type == "c2b" {
		method, payout = invoices.Payment(seller)
	}

	suffix := []string{weight.FloatString(2), pdf.Decimal(trade.TotalPrice), invoices.Name(seller),
		seller.Email, seller.Phone, invoices.Address(seller), invoices.Name(buyer), buyer.Email,
		buyer.Phone, invoices.Address(buyer), method, payout}
	if !itemised {
		return [][]string{append(append(prefix, strings.Join(materials, "\n")), suffix...)}
	}

	var rows [][]string
	for i, line := range trade.Items {
		row := append([]string{}, prefix...)
		row = append(row, strconv.Itoa(i+1), line.MaterialName, pdf.Decimal(line.Weight),
			pdf.Decimal(line.Price), pdf.Product(line.Weight, line.Price))
		rows = append(rows, append(row, suffix...))
	}
	if len(rows) == 0 {
		rows = append(rows, append(append(prefix, "", "", "", "", ""), suffix...))
	}

	return rows
}
