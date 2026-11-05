// Package pdf renders invoice documents without HTTP or database dependencies.
package pdf

import (
	"bytes"
	"fmt"
	"math/big"

	"github.com/go-pdf/fpdf"
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

// Render makes an A4 invoice with a repeating header, wrapped lines and page breaks.
func Render(invoice Invoice) ([]byte, error) {
	doc := fpdf.New("P", "mm", "A4", "")
	doc.SetMargins(16, 35, 16)
	doc.SetAutoPageBreak(true, 22)
	doc.SetTitle("3rEco Invoice "+invoice.Number, true)
	doc.SetAuthor("3rEco", false)
	// Keep text inspectable for document QA and simple downstream PDF readers.
	doc.SetCompression(false)
	text := doc.UnicodeTranslatorFromDescriptor("")

	doc.SetHeaderFunc(func() {
		doc.SetFillColor(104, 196, 11)
		doc.Rect(0, 0, 210, 27, "F")
		doc.SetTextColor(20, 40, 10)
		doc.SetFont("Helvetica", "B", 22)
		doc.SetXY(16, 8)
		doc.Cell(90, 10, "3rEco")
		doc.SetFont("Helvetica", "B", 17)
		doc.CellFormat(88, 10, "INVOICE", "", 0, "R", false, 0, "")
		doc.SetTextColor(30, 30, 30)
		doc.SetXY(16, 35)
	})
	doc.SetFooterFunc(func() {
		doc.SetY(-16)
		doc.SetFont("Helvetica", "", 8)
		doc.CellFormat(178, 5, "This invoice was generated automatically by 3rEco.",
			"", 1, "C", false, 0, "")
		doc.CellFormat(178, 4, fmt.Sprintf("Page %d", doc.PageNo()), "", 0, "C", false, 0, "")
	})

	doc.AddPage()
	doc.SetFont("Helvetica", "B", 12)
	doc.MultiCell(178, 7, text("Invoice "+invoice.Number+" | "+invoice.Date), "", "L", false)
	doc.SetFont("Helvetica", "", 10)
	doc.MultiCell(178, 6, invoice.Type, "", "L", false)
	doc.Ln(5)

	for _, party := range []struct{ label, details string }{
		{"FROM", invoice.Seller}, {"TO", invoice.Buyer},
	} {
		doc.SetFont("Helvetica", "B", 10)
		doc.MultiCell(178, 6, party.label, "", "L", false)
		doc.SetFont("Helvetica", "", 10)
		doc.MultiCell(178, 5, text(party.details), "", "L", false)
		doc.Ln(4)
	}

	tableHeader := func() {
		doc.SetFont("Helvetica", "B", 9)
		doc.SetFillColor(239, 245, 234)
		for i, label := range []string{"Material", "Weight (kg)", "Price / kg (R)", "Total (R)"} {
			doc.CellFormat([]float64{76, 34, 34, 34}[i], 8, label, "B", 0, "L", true, 0, "")
		}
		doc.Ln(8)
		doc.SetFont("Helvetica", "", 9)
	}
	tableHeader()

	for _, line := range invoice.Lines {
		cells := []string{text(line.Material), line.Weight, line.Price, line.Total}
		widths := []float64{76, 34, 34, 34}
		// Split every cell, including unusually large exact amounts, to avoid overlaps.
		wrapped := make([][][]byte, len(cells))
		count := 1
		for i, cell := range cells {
			wrapped[i] = doc.SplitLines([]byte(cell), widths[i]-2)
			count = max(count, len(wrapped[i]))
		}

		for row := 0; row < count; row++ {
			if doc.GetY()+6 > 275 {
				doc.AddPage()
				tableHeader()
			}

			for column, lines := range wrapped {
				cell := ""
				if row < len(lines) {
					cell = string(lines[row])
				}

				doc.CellFormat(widths[column], 6, cell, "", 0, "L", false, 0, "")
			}
			doc.Ln(6)
		}
		doc.Ln(2)
	}

	doc.Ln(4)
	doc.SetFont("Helvetica", "B", 12)
	doc.MultiCell(178, 8, "Grand total: R "+invoice.Total, "T", "R", false)
	doc.Ln(5)
	doc.SetFont("Helvetica", "B", 10)
	doc.MultiCell(178, 6, "Payment details", "", "L", false)
	doc.SetFont("Helvetica", "", 10)
	doc.MultiCell(178, 5, text(invoice.Payment), "", "L", false)

	var out bytes.Buffer
	if err := doc.Output(&out); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}
