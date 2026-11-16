package stock

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	store "github.com/connor-davis/3reco/internal/stores/stock"
)

// MaxImportRows is the most lines one import can hold.
const MaxImportRows = 500

// MaxImportBytes is the biggest CSV file a person can upload.
const MaxImportBytes = 1 << 20

// ImportRow is one CSV line as typed. Every cell stays a string, so exact
// decimals never pass through a float.
type ImportRow struct {
	Material    string `json:"material"`
	Weight      string `json:"weight_kg"`
	Price       string `json:"price_per_kg"`
	Listed      string `json:"listed"`
	Fulfillment string `json:"fulfillment"`
	PickupArea  string `json:"pickup_area"`
}

// ImportLine is a checked row. Errors is keyed by column name.
type ImportLine struct {
	ImportRow
	MaterialName string            `json:"material_name"`
	Errors       map[string]string `json:"errors"`
}

// ImportPreview is every row with its problems. OK is true when none has one.
type ImportPreview struct {
	Lines []ImportLine `json:"rows"`
	OK    bool         `json:"ok"`
}

var importColumns = []string{
	"material", "weight_kg", "price_per_kg", "listed", "fulfillment", "pickup_area",
}

// ParseImport reads an uploaded CSV into rows without checking their values.
func ParseImport(data []byte) ([]ImportRow, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))

	reader := csv.NewReader(bytes.NewReader(data))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true

	records, err := reader.ReadAll()
	if err != nil {
		return nil, apperr.BadRequest("That file is not a readable CSV.", nil)
	}

	if len(records) == 0 {
		return nil, apperr.BadRequest("The file is empty.", nil)
	}

	position := map[string]int{}
	for index, name := range records[0] {
		name = strings.ToLower(strings.TrimSpace(name))
		if !slices.Contains(importColumns, name) {
			return nil, apperr.BadRequest(
				fmt.Sprintf("Unknown column %q. Use: %s.", name, strings.Join(importColumns, ", ")),
				nil,
			)
		}

		position[name] = index
	}

	for _, required := range importColumns[:3] {
		if _, ok := position[required]; !ok {
			return nil, apperr.BadRequest(fmt.Sprintf("Add a %s column.", required), nil)
		}
	}

	rows := []ImportRow{}
	for number, record := range records[1:] {
		if len(record) > len(records[0]) {
			return nil, apperr.BadRequest(
				fmt.Sprintf("Row %d has more cells than the header. Put quotes around commas.", number+1),
				nil,
			)
		}

		cell := func(name string) string {
			if index, ok := position[name]; ok && index < len(record) {
				return strings.TrimSpace(record[index])
			}

			return ""
		}

		row := ImportRow{
			Material: cell("material"), Weight: cell("weight_kg"), Price: cell("price_per_kg"),
			Listed: cell("listed"), Fulfillment: cell("fulfillment"), PickupArea: cell("pickup_area"),
		}
		if row == (ImportRow{}) {
			continue
		}

		rows = append(rows, row)
	}

	if len(rows) == 0 {
		return nil, apperr.BadRequest("The file has no stock lines.", nil)
	}

	if len(rows) > MaxImportRows {
		return nil, tooManyRows()
	}

	return rows, nil
}

func tooManyRows() *apperr.Error {
	return apperr.BadRequest(fmt.Sprintf("Import up to %d lines at a time.", MaxImportRows), nil)
}

// PreviewImport checks rows and writes nothing.
func (service *Service) PreviewImport(ctx context.Context, rows []ImportRow) (ImportPreview, error) {
	if len(rows) == 0 {
		return ImportPreview{}, apperr.BadRequest("Add at least one line.", nil)
	}

	if len(rows) > MaxImportRows {
		return ImportPreview{}, tooManyRows()
	}

	preview, _, err := service.checkImport(ctx, rows)

	return preview, err
}

// CommitImport checks every row again and inserts them all in one
// transaction. One bad row refuses the whole import. Listed rows count as
// first publications, but each person hears about the import once.
func (service *Service) CommitImport(
	ctx context.Context,
	owner string,
	rows []ImportRow,
) (int, error) {
	if len(rows) == 0 {
		return 0, apperr.BadRequest("Add at least one line.", nil)
	}

	if len(rows) > MaxImportRows {
		return 0, tooManyRows()
	}

	err := service.db.InTx(
		ctx,
		func(ctx context.Context) error {
			preview, items, err := service.checkImport(ctx, rows)
			if err != nil {
				return err
			}

			if !preview.OK {
				return &apperr.Error{
					Status: http.StatusBadRequest, Code: "invalid",
					Message: "Fix the marked lines first.", Details: preview,
				}
			}

			listed := []string{}
			for _, item := range items {
				item.OwnerID = owner

				first, err := service.store.Create(ctx, item)
				if err != nil {
					return err
				}

				if first {
					listed = append(listed, item.ID)
				}
			}

			return service.store.TellImport(ctx, owner, listed)
		},
	)
	if err != nil {
		return 0, err
	}

	return len(rows), nil
}

// checkImport runs the single-line rules on every row. items holds the rows
// ready to insert, in order, and is only complete when preview.OK is true.
func (service *Service) checkImport(
	ctx context.Context,
	rows []ImportRow,
) (ImportPreview, []store.Item, error) {
	materials, err := service.store.Materials(ctx)
	if err != nil {
		return ImportPreview{}, nil, err
	}

	preview := ImportPreview{Lines: make([]ImportLine, 0, len(rows)), OK: true}
	items := make([]store.Item, 0, len(rows))

	for _, row := range rows {
		line := ImportLine{ImportRow: trimRow(row), Errors: map[string]string{}}
		item := store.Item{ID: database.NewID()}

		line.MaterialName, item.MaterialID = findMaterial(materials, line.Material, line.Errors)
		checkAmounts(line.ImportRow, &item, line.Errors)
		checkOptions(line.ImportRow, &item, line.Errors)
		checkFormulas(line.ImportRow, line.Errors)

		if len(line.Errors) > 0 {
			preview.OK = false
		}

		preview.Lines = append(preview.Lines, line)
		items = append(items, item)
	}

	return preview, items, nil
}

func trimRow(row ImportRow) ImportRow {
	return ImportRow{
		Material: strings.TrimSpace(row.Material), Weight: strings.TrimSpace(row.Weight),
		Price: strings.TrimSpace(row.Price), Listed: strings.TrimSpace(row.Listed),
		Fulfillment: strings.TrimSpace(row.Fulfillment), PickupArea: strings.TrimSpace(row.PickupArea),
	}
}

// findMaterial matches an id first, then a name ignoring case.
func findMaterial(
	materials []store.Material,
	ref string,
	problems map[string]string,
) (string, string) {
	if ref == "" {
		problems["material"] = "Add a material name."

		return "", ""
	}

	var named []store.Material
	for _, material := range materials {
		if material.ID == ref {
			return material.Name, material.ID
		}

		if strings.EqualFold(material.Name, ref) {
			named = append(named, material)
		}
	}

	switch len(named) {
	case 1:
		return named[0].Name, named[0].ID
	case 0:
		problems["material"] = "No material has that name or id."
	default:
		problems["material"] = "Several materials share that name. Use its id."
	}

	return "", ""
}

// checkAmounts reuses the single-stock rules. Weight and price are checked on
// their own, so a line shows both problems at once.
func checkAmounts(row ImportRow, item *store.Item, problems map[string]string) {
	item.Weight, item.Price = row.Weight, row.Price

	if row.Weight == "" {
		problems["weight_kg"] = "Add a weight in kg."
	} else if err := validate(store.Item{Weight: row.Weight, Price: "1"}, true, true); err != nil {
		problems["weight_kg"] = amountMessage(err, "weight")
	}

	if row.Price == "" {
		problems["price_per_kg"] = "Add a price per kg."
	} else if err := validate(store.Item{Weight: "1", Price: row.Price}, true, true); err != nil {
		problems["price_per_kg"] = amountMessage(err, "price")
	}
}

func amountMessage(err error, field string) string {
	var failure *apperr.Error
	if !errors.As(err, &failure) || failure.Data[field] == "" {
		return "Enter an amount, such as 12.50."
	}

	if failure.Data[field] == "Enter a decimal string." {
		return "Use digits and a dot only, such as 12.50."
	}

	return failure.Data[field]
}

func checkOptions(row ImportRow, item *store.Item, problems map[string]string) {
	switch strings.ToLower(row.Listed) {
	case "", "no", "false", "0":
	case "yes", "true", "1":
		item.IsListed = true
	default:
		problems["listed"] = "Use yes or no."
	}

	in := Input{}
	if row.Fulfillment != "" {
		mode := strings.ToLower(row.Fulfillment)
		in.FulfillmentMode = &mode
	}

	if row.PickupArea != "" {
		in.PickupArea = &row.PickupArea
	}

	var failure *apperr.Error
	if err := applyFulfillment(item, in); errors.As(err, &failure) {
		if message := failure.Data["fulfillment_mode"]; message != "" {
			problems["fulfillment"] = message
		}

		if message := failure.Data["pickup_area"]; message != "" {
			problems["pickup_area"] = message
		}
	}
}

// checkFormulas refuses cells a spreadsheet would run as a formula.
func checkFormulas(row ImportRow, problems map[string]string) {
	cells := map[string]string{
		"material": row.Material, "weight_kg": row.Weight, "price_per_kg": row.Price,
		"listed": row.Listed, "fulfillment": row.Fulfillment, "pickup_area": row.PickupArea,
	}

	for column, value := range cells {
		if value != "" && strings.ContainsRune("=+-@", rune(value[0])) {
			problems[column] = "A cell cannot start with =, +, - or @."
		}
	}
}
