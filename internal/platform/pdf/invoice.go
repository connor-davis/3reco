// Package pdf renders invoice documents without HTTP or database dependencies.
package pdf

import (
	_ "embed"
	"math/big"
	"strings"

	"github.com/gpdf-dev/gpdf/document"
	pdflib "github.com/gpdf-dev/gpdf/pdf"
	"github.com/gpdf-dev/gpdf/template"
)

// Montserrat (SIL OFL 1.1, see assets/OFL.txt) is the app's font, and the logo is
// the app's own. Both are embedded because go:embed cannot reach outside this folder.
var (
	//go:embed assets/Montserrat-Regular.ttf
	fontRegular []byte
	//go:embed assets/Montserrat-Bold.ttf
	fontBold []byte
	//go:embed assets/logo-full.png
	logo []byte
)

// Colours, as sRGB. The green is the app's --primary, oklch(0.498419 0.070909 174.46).
var (
	green      = pdflib.RGBHex(0x307060)
	ink        = pdflib.RGBHex(0x1E1E1E)
	mutedGrey  = pdflib.RGBHex(0x6B6B6B)
	whiteColor = pdflib.RGBHex(0xFFFFFF)
)

// Line holds already formatted exact decimal strings.
type Line struct {
	Material string
	Weight   string
	Price    string
	Total    string
}

// Invoice is the immutable information displayed on an invoice.
type Invoice struct {
	Number  string
	Date    string
	Seller  string
	Buyer   string
	Type    string
	Payment string
	Total   string
	Lines   []Line
}

// Decimal formats an exact decimal or rational value with two decimal places.
func Decimal(value string) string {
	number, ok := new(big.Rat).SetString(value)
	if !ok {
		return "0.00"
	}

	return number.FloatString(2)
}

// Product multiplies stored decimals without floating point arithmetic.
func Product(weight, price string) string {
	left, leftOK := new(big.Rat).SetString(weight)
	right, rightOK := new(big.Rat).SetString(price)
	if !leftOK || !rightOK {
		return "0.00"
	}

	return left.Mul(left, right).FloatString(2)
}

// Weight prints a stored weight with at least two decimals ("13.10"), the same
// text the dialog and the CSV show. Extra decimals stay as stored, never rounded.
func Weight(value string) string {
	whole, fraction, _ := strings.Cut(value, ".")
	fraction = strings.TrimRight(fraction, "0")

	return whole + "." + fraction + strings.Repeat("0", max(0, 2-len(fraction)))
}

// Grouped puts spaces between thousands, as the invoice prints an amount.
func Grouped(value string) string {
	whole, fraction, decimal := strings.Cut(value, ".")
	sign := ""
	if strings.HasPrefix(whole, "-") {
		sign, whole = "-", strings.TrimPrefix(whole, "-")
	}

	for index := len(whole) - 3; index > 0; index -= 3 {
		whole = whole[:index] + " " + whole[index:]
	}

	if decimal {
		return sign + whole + "." + fraction
	}

	return sign + whole
}

// Render makes an A4 invoice with a repeating header, wrapped lines and page breaks.
func Render(invoice Invoice) ([]byte, error) {
	doc := template.New(
		template.WithPageSize(document.A4),
		template.WithMargins(document.Edges{
			Top: document.Mm(14), Right: document.Mm(16), Bottom: document.Mm(14), Left: document.Mm(16),
		}),
		template.WithFont("Montserrat", fontRegular),
		template.WithFont("Montserrat-Bold", fontBold),
		template.WithDefaultFont("Montserrat", 10),
		template.WithMetadata(document.DocumentMetadata{
			Title: "3REco Invoice " + invoice.Number, Author: "3REco",
		}),
	)

	// The header and footer repeat on every page.
	doc.Header(func(page *template.PageBuilder) {
		page.AutoRow(func(row *template.RowBuilder) {
			row.Col(6, func(col *template.ColBuilder) {
				col.Image(logo, template.FitHeight(document.Mm(13)))
			})
			row.Col(6, func(col *template.ColBuilder) {
				col.Text("INVOICE", template.Bold(), template.FontSize(17), template.AlignRight())
				col.Text(invoice.Number+" | "+invoice.Date, template.FontSize(10),
					template.AlignRight(), template.TextColor(mutedGrey))
			})
		})
		page.AutoRow(func(row *template.RowBuilder) {
			row.Col(12, func(col *template.ColBuilder) {
				col.Spacer(document.Mm(2))
				col.Line(template.LineColor(green), template.LineThickness(document.Pt(1.5)))
				col.Spacer(document.Mm(3))
			})
		})
	})
	doc.Footer(func(page *template.PageBuilder) {
		page.AutoRow(func(row *template.RowBuilder) {
			row.Col(12, func(col *template.ColBuilder) {
				col.Text("This invoice was generated automatically by 3REco.",
					template.FontSize(8), template.AlignCenter(), template.TextColor(mutedGrey))
				col.Text("Page "+document.PageNumberPlaceholder, template.FontSize(8), template.AlignCenter(), template.TextColor(mutedGrey))
			})
		})
	})

	page := doc.AddPage()
	page.AutoRow(func(row *template.RowBuilder) {
		row.Col(12, func(col *template.ColBuilder) {
			col.Text("Invoice "+invoice.Number+" | "+invoice.Date, template.Bold(), template.FontSize(12))
			col.Text(invoice.Type, template.TextColor(mutedGrey))
			col.Spacer(document.Mm(5))
		})
	})

	page.AutoRow(func(row *template.RowBuilder) {
		for _, party := range []struct{ label, details string }{
			{"FROM", invoice.Seller}, {"TO", invoice.Buyer},
		} {
			row.Col(6, func(col *template.ColBuilder) {
				block(col, party.label, party.details)
			})
		}
	})

	page.AutoRow(func(row *template.RowBuilder) {
		row.Col(12, func(col *template.ColBuilder) {
			block(col, "PAYMENT DETAILS", invoice.Payment)
		})
	})

	rows := make([][]string, 0, len(invoice.Lines))
	for _, line := range invoice.Lines {
		rows = append(rows, []string{line.Material, Grouped(Weight(line.Weight)), Grouped(line.Price), Grouped(line.Total)})
	}
	page.AutoRow(func(row *template.RowBuilder) {
		row.Col(12, func(col *template.ColBuilder) {
			col.Table([]string{"Material", "Weight (kg)", "Price / kg (R)", "Total (R)"}, rows,
				template.ColumnWidths(34, 22, 22, 22),
				template.ColumnAlign(document.AlignLeft, document.AlignRight, document.AlignRight, document.AlignRight),
				template.TableHeaderStyle(template.TextColor(whiteColor), template.BgColor(green)),
			)
		})
	})

	page.AutoRow(func(row *template.RowBuilder) {
		row.Col(12, func(col *template.ColBuilder) {
			col.Spacer(document.Mm(5))
			col.Text("Grand total: R "+Grouped(invoice.Total),
				template.Bold(), template.FontSize(13), template.AlignRight(), template.TextColor(green))
		})
	})

	return doc.Generate()
}

// block prints a muted label over the lines of a party or payment text.
func block(col *template.ColBuilder, label, details string) {
	col.Text(label, template.Bold(), template.FontSize(8), template.TextColor(mutedGrey))
	for _, line := range strings.Split(details, "\n") {
		col.Text(line, template.TextColor(ink))
	}
	col.Spacer(document.Mm(5))
}
