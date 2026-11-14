// Package pdf renders invoice documents without HTTP or database dependencies.
package pdf

import (
	"bytes"
	_ "embed"
	"image/png"
	"math/big"
	"strings"

	"github.com/gpdf-dev/gpdf/document"
	"github.com/gpdf-dev/gpdf/document/layout"
	"github.com/gpdf-dev/gpdf/document/render"
	pdflib "github.com/gpdf-dev/gpdf/pdf"
	"github.com/gpdf-dev/gpdf/pdf/font"
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
	ruleGrey   = pdflib.RGBHex(0xE5E7EB)
	totalGrey  = pdflib.RGBHex(0x9CA3AF)
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
//
// It builds gpdf's document tree directly, not through gpdf's template package,
// because the template's table cannot pad a cell or fill it edge to edge.
func Render(invoice Invoice) ([]byte, error) {
	logoSize, err := png.DecodeConfig(bytes.NewReader(logo))
	if err != nil {
		return nil, err
	}

	fonts := map[string]*font.TrueTypeFont{}
	for family, data := range map[string][]byte{fontFamily: fontRegular, fontFamily + "-Bold": fontBold} {
		if fonts[family], err = font.ParseTrueType(data); err != nil {
			return nil, err
		}
	}

	resolver := fontResolver{fonts: fonts}
	margins := document.Edges{
		Top: document.Mm(14), Right: document.Mm(16), Bottom: document.Mm(14), Left: document.Mm(16),
	}

	// The header and footer repeat on every page.
	header := []document.DocumentNode{
		&document.Box{
			BoxStyle: document.BoxStyle{Direction: document.DirectionHorizontal},
			Content: []document.DocumentNode{
				&document.Box{
					BoxStyle: document.BoxStyle{Width: document.Pct(50)},
					Content: []document.DocumentNode{&document.Image{
						Source: document.ImageSource{
							Data: logo, Format: document.ImagePNG, Width: logoSize.Width, Height: logoSize.Height,
						},
						DisplayHeight: document.Mm(13),
					}},
				},
				&document.Box{
					BoxStyle: document.BoxStyle{Width: document.Pct(50)},
					Content: []document.DocumentNode{
						text("INVOICE", 17, true, green, document.AlignRight),
						text(invoice.Number+" | "+invoice.Date, 10, false, mutedGrey, document.AlignRight),
					},
				},
			},
		},
		spaced(document.Edges{Top: document.Mm(2), Bottom: document.Mm(2)}, &document.Box{
			BoxStyle: document.BoxStyle{Height: document.Pt(1.5), Background: &green},
		}),
		spaced(document.Edges{Bottom: document.Mm(4)}, text(invoice.Type, 9, false, mutedGrey, document.AlignLeft)),
	}
	footer := []document.DocumentNode{
		text("This invoice was generated automatically by 3REco.", 8, false, mutedGrey, document.AlignCenter),
		text("Page "+document.PageNumberPlaceholder, 8, false, mutedGrey, document.AlignCenter),
	}

	body := []document.DocumentNode{
		&document.Box{
			BoxStyle: document.BoxStyle{
				Direction: document.DirectionHorizontal,
				Margin:    document.Edges{Top: document.Mm(5), Bottom: document.Mm(5)},
			},
			Content: []document.DocumentNode{party("FROM", invoice.Seller), party("TO", invoice.Buyer)},
		},
		party("PAYMENT DETAILS", invoice.Payment),
		linesTable(invoice.Lines),
		spaced(document.Edges{Top: document.Mm(5)}, &document.Box{
			BoxStyle: document.BoxStyle{
				Padding: document.Edges{Top: document.Mm(2), Right: cellGap},
				Border:  document.BorderEdges{Top: border(0.75, totalGrey)},
			},
			Content: []document.DocumentNode{
				text("Grand total: R "+Grouped(invoice.Total), 13, true, green, document.AlignRight),
			},
		}),
	}

	doc := &document.Document{
		Metadata: document.DocumentMetadata{
			Title: "3REco Invoice " + invoice.Number, Author: "3REco", Producer: "gpdf",
		},
		DefaultStyle: document.Style{
			FontFamily: fontFamily, FontSize: 10, FontWeight: document.WeightNormal,
			Color: ink, TextAlign: document.AlignLeft, LineHeight: 1.2,
		},
		Pages: []*document.Page{{Size: document.A4, Margins: margins, Content: body}},
	}

	paginator := layout.NewPaginator(document.A4, margins, resolver)
	paginator.SetHeaderFooter(header, footer)
	pages, err := paginator.PaginateWithError(doc)
	if err != nil {
		return nil, err
	}

	layout.ResolvePageNumbersWithFonts(pages, resolver)

	var out bytes.Buffer
	renderer := render.NewPDFRenderer(pdflib.NewWriter(&out))
	for family, ttf := range fonts {
		renderer.RegisterTTFont(family, ttf, map[string][]byte{fontFamily: fontRegular, fontFamily + "-Bold": fontBold}[family])
	}

	if err := renderer.RenderDocument(pages, doc.Metadata); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}

const fontFamily = "Montserrat"

// cellGap is the room between a table cell's edge and its text.
var cellGap = document.Mm(2)

// linesTable is the lines table: a solid green header bar and a grey line under every
// row. gpdf repeats the header on each page the table runs onto.
func linesTable(lines []Line) *document.Table {
	// Material reads left, the amounts read right. Only the first column pads on the
	// left, so the numbers sit flush to each column's right edge.
	cell := func(content string, column int, header bool) document.TableCell {
		align := document.AlignRight
		padding := document.Edges{Right: cellGap}
		if column == 0 {
			align = document.AlignLeft
			padding.Left = cellGap
		}

		var look document.Style
		textColor := ink
		if header {
			padding.Top, padding.Bottom = cellGap, cellGap
			look = document.Style{Padding: padding, Background: &green}
			textColor = whiteColor
		} else {
			padding.Top, padding.Bottom = document.Mm(1.75), document.Mm(1.75)
			look = document.Style{
				Padding: padding,
				Border:  document.BorderEdges{Bottom: border(0.5, ruleGrey)},
			}
		}

		return document.TableCell{
			Content:   []document.DocumentNode{text(content, 9, header, textColor, align)},
			ColSpan:   1,
			RowSpan:   1,
			CellStyle: look,
		}
	}

	table := &document.Table{
		Columns: []document.TableColumn{
			{Width: document.Pct(34)}, {Width: document.Pct(22)}, {Width: document.Pct(22)}, {Width: document.Pct(22)},
		},
		Header: []document.TableRow{{}},
	}
	for column, label := range []string{"Material", "Weight (kg)", "Price / kg (R)", "Total (R)"} {
		table.Header[0].Cells = append(table.Header[0].Cells, cell(label, column, true))
	}

	for _, line := range lines {
		row := document.TableRow{}
		for column, value := range []string{line.Material, Grouped(Weight(line.Weight)), Grouped(line.Price), Grouped(line.Total)} {
			row.Cells = append(row.Cells, cell(value, column, false))
		}
		table.Body = append(table.Body, row)
	}

	return table
}

// party is a muted label over the lines of a party or payment text.
func party(label, details string) *document.Box {
	box := &document.Box{
		BoxStyle: document.BoxStyle{Width: document.Pct(50), Margin: document.Edges{Bottom: document.Mm(5)}},
		Content:  []document.DocumentNode{text(label, 8, true, mutedGrey, document.AlignLeft)},
	}
	for line := range strings.SplitSeq(details, "\n") {
		box.Content = append(box.Content, text(line, 10, false, ink, document.AlignLeft))
	}

	return box
}

func text(content string, size float64, bold bool, color pdflib.Color, align document.TextAlign) *document.Text {
	style := document.DefaultStyle()
	style.FontFamily, style.FontSize, style.Color, style.TextAlign = fontFamily, size, color, align
	if bold {
		style.FontWeight = document.WeightBold
	}

	return &document.Text{Content: content, TextStyle: style}
}

// spaced wraps a node in an empty box that holds the margin. gpdf paints a box's
// background and border over its margin too, so a decorated box keeps no margin of its own.
func spaced(margin document.Edges, node document.DocumentNode) *document.Box {
	return &document.Box{BoxStyle: document.BoxStyle{Margin: margin}, Content: []document.DocumentNode{node}}
}

func border(thickness float64, color pdflib.Color) document.BorderSide {
	return document.BorderSide{Width: document.Pt(thickness), Style: document.BorderSolid, Color: color}
}

// fontResolver measures text with the two embedded Montserrat faces, so wrapping and
// page breaks match what the viewer draws.
type fontResolver struct {
	fonts map[string]*font.TrueTypeFont
}

// Resolve picks the bold face for bold text and the regular face otherwise.
func (r fontResolver) Resolve(family string, weight document.FontWeight, italic bool) layout.ResolvedFont {
	key := family
	if weight >= document.WeightBold {
		key += "-Bold"
	}

	metrics := r.fonts[key].Metrics()
	scale := 1.0 / float64(metrics.UnitsPerEm)

	return layout.ResolvedFont{
		ID: key,
		Metrics: layout.FontMetrics{
			Ascender:   float64(metrics.Ascender) * scale,
			Descender:  float64(metrics.Descender) * scale,
			LineHeight: float64(metrics.Ascender-metrics.Descender+metrics.LineGap) * scale,
			CapHeight:  float64(metrics.CapHeight) * scale,
		},
	}
}

// MeasureString returns the width of the text in points.
func (r fontResolver) MeasureString(face layout.ResolvedFont, content string, size float64) float64 {
	return font.MeasureString(r.fonts[face.ID], content, size)
}

// LineBreak splits the text into lines that fit the width.
func (r fontResolver) LineBreak(face layout.ResolvedFont, content string, size, maxWidth float64) []string {
	return font.LineBreak(r.fonts[face.ID], content, size, maxWidth)
}
