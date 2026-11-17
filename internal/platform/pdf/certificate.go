package pdf

import (
	"github.com/gpdf-dev/gpdf/document"
)

// Detail is one labelled block at the top of a recycling record, such as who it is for.
type Detail struct {
	Label string
	Text  string
}

// Certificate is the immutable information shown on a recycling record. Every
// amount is already formatted, so this package never does arithmetic on it.
type Certificate struct {
	Subtitle string
	Kind     string
	Details  []Detail
	Headers  []string
	Rows     [][]string
	Total    []string
	Method   string
}

// recordStatement is the one claim the record makes. It records what traders reported
// and says nothing about checking, auditing or certifying it.
const recordStatement = "This page records reported trade weights for completed trades on 3REco. " +
	"The weights are the ones the traders entered."

// RenderCertificate makes an A4 recycling record under the same header as an invoice.
func RenderCertificate(record Certificate) ([]byte, error) {
	body := []document.DocumentNode{spaced(
		document.Edges{Top: document.Mm(3), Bottom: document.Mm(4)},
		text(recordStatement, 10, false, ink, document.AlignLeft),
	)}

	// Details sit two to a row, like the invoice's FROM and TO.
	for start := 0; start < len(record.Details); start += 2 {
		row := &document.Box{
			BoxStyle: document.BoxStyle{Direction: document.DirectionHorizontal},
		}

		for _, detail := range record.Details[start:min(start+2, len(record.Details))] {
			row.Content = append(row.Content, party(detail.Label, detail.Text))
		}

		body = append(body, row)
	}

	body = append(body,
		recordTable(record),
		spaced(document.Edges{Top: document.Mm(5)}, text(record.Method, 9, false, mutedGrey, document.AlignLeft)),
	)

	page := pageParts{
		Title:    "3REco Recycling record",
		Heading:  "RECYCLING RECORD",
		Subtitle: record.Subtitle,
		Kind:     record.Kind,
		Footer:   "This record was generated automatically by 3REco.",
		Body:     body,
	}

	return renderPages(page)
}

// recordTable is the material table followed by the total row. The first column is
// wider; the amount columns share the rest.
func recordTable(record Certificate) *document.Table {
	amountColumns := max(1, len(record.Headers)-1)
	table := &document.Table{
		Columns: []document.TableColumn{{Width: document.Pct(34)}},
		Header:  []document.TableRow{{}},
	}

	for range amountColumns {
		table.Columns = append(table.Columns, document.TableColumn{Width: document.Pct(66 / float64(amountColumns))})
	}

	for column, label := range record.Headers {
		table.Header[0].Cells = append(table.Header[0].Cells, tableCell(label, column, true))
	}

	for _, values := range append(append([][]string{}, record.Rows...), record.Total) {
		row := document.TableRow{}
		for column, value := range values {
			row.Cells = append(row.Cells, tableCell(value, column, false))
		}

		table.Body = append(table.Body, row)
	}

	return table
}
