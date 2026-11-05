package importer

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	store "github.com/connor-davis/3reco/internal/stores/importer"
)

// kind says how a Convex value becomes a Postgres value.
type kind int

const (
	kText      kind = iota // a string
	kNum                   // a JSON number, kept as exact digits
	kNumString             // a string or a JSON number, kept as exact digits
	kInt                   // a whole number that fits int32
	kBool                  // true or false
	kTime                  // milliseconds since the epoch
	kDate                  // "YYYY-MM-DD"
	kRef                   // an id that must be in refs
)

// idSet is every id of one table, for checking foreign keys.
type idSet map[string]bool

// field maps one Convex key to one Postgres column.
type field struct {
	col, key string
	kind     kind
	required bool
	nonNeg   bool     // numbers only: a negative value breaks a CHECK
	oneOf    []string // text only: the values the CHECK allows
	refs     idSet    // kRef only
}

var (
	numberText = regexp.MustCompile(`^-?\d+(\.\d+)?([eE][+-]?\d+)?$`)
	dayText    = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

// row is one Convex document being checked. Every broken rule goes to the
// report with the table, the _id and the field.
type row struct {
	rep   *Report
	table string
	id    string
	d     doc
	// prefix names the list element a child row came from, for problems.
	prefix string
}

func newRow(rep *Report, table string, d doc) *row {
	id, ok := d["_id"].(string)
	if !ok || id == "" {
		rep.problem(table, "(no _id)", "_id", "document has no _id")
	}

	return &row{rep: rep, table: table, id: id, d: d}
}

func (r *row) fail(key, reason string) {
	r.rep.problem(r.table, r.id, r.prefix+key, reason)
}

// build reads the fields into a row for the database. A missing optional
// field is left out, so the database writes NULL or its default.
func (r *row) build(fields []field) store.Row {
	out := store.Row{"id": r.id}

	for _, f := range fields {
		value, present := r.d[f.key]
		if !present || value == nil {
			if f.required {
				r.fail(f.key, "is required")
			}

			continue
		}

		if converted, ok := r.convert(f, value); ok {
			out[f.col] = converted
		}
	}

	return out
}

func (r *row) convert(f field, value any) (any, bool) {
	switch f.kind {
	case kText:
		text, ok := value.(string)
		if !ok {
			r.fail(f.key, "must be text")

			return nil, false
		}

		if len(f.oneOf) > 0 && !slices.Contains(f.oneOf, text) {
			r.fail(f.key, fmt.Sprintf("%q is not one of %s", text, strings.Join(f.oneOf, ", ")))

			return nil, false
		}

		return text, true
	case kNum, kNumString:
		text, ok := exactNumber(value, f.kind == kNumString)
		if !ok {
			r.fail(f.key, "is not a plain number")

			return nil, false
		}

		if f.nonNeg && negative(text) {
			r.fail(f.key, "must not be negative")

			return nil, false
		}

		return store.Typed{Type: "numeric", Text: text}, true
	case kInt:
		return r.whole(f.key, value)
	case kBool:
		flag, ok := value.(bool)
		if !ok {
			r.fail(f.key, "must be true or false")

			return nil, false
		}

		return flag, true
	case kTime:
		when, ok := millis(value)
		if !ok {
			r.fail(f.key, "is not a time in milliseconds")

			return nil, false
		}

		return when, true
	case kDate:
		text, _ := value.(string)
		if _, err := time.Parse("2006-01-02", text); err != nil || !dayText.MatchString(text) {
			r.fail(f.key, "is not a real YYYY-MM-DD date")

			return nil, false
		}

		return store.Typed{Type: "date", Text: text}, true
	case kRef:
		id, _ := value.(string)
		if !f.refs[id] {
			r.fail(f.key, fmt.Sprintf("no row with id %q to point at", id))

			return nil, false
		}

		return id, true
	}

	return nil, false
}

// whole reads an integer column (area_code). A float like 2000 is fine; 20.5 is not.
func (r *row) whole(key string, value any) (any, bool) {
	number, ok := value.(json.Number)
	if ok {
		if n, err := strconv.ParseInt(number.String(), 10, 32); err == nil {
			return int32(n), true
		}

		if f, err := number.Float64(); err == nil && f == math.Trunc(f) &&
			math.Abs(f) <= math.MaxInt32 {
			return int32(f), true
		}
	}

	r.fail(key, "must be a whole number that fits in 32 bits")

	return nil, false
}

// created sets created_at (and updated_at, which Convex does not keep) from
// _creationTime.
func (r *row) created(out store.Row, withUpdated bool) {
	when, ok := millis(r.d["_creationTime"])
	if !ok {
		r.fail("_creationTime", "is not a time in milliseconds")

		return
	}

	out["created_at"] = when

	if withUpdated {
		out["updated_at"] = when
	}
}

// text reads an optional string. A value of the wrong type is a problem.
func (r *row) text(key string) string {
	value, present := r.d[key]
	if !present || value == nil {
		return ""
	}

	text, ok := value.(string)
	if !ok {
		r.fail(key, "must be text")
	}

	return text
}

// exactNumber returns the digits of a number as Convex stored them. Numbers
// are never turned into float64, so 0.1+0.2 stays 0.30000000000000004.
func exactNumber(value any, allowString bool) (string, bool) {
	var text string

	switch v := value.(type) {
	case json.Number:
		text = v.String()
	case string:
		if !allowString {
			return "", false
		}

		text = strings.TrimSpace(v)
	default:
		return "", false
	}

	if len(text) > 40 || !numberText.MatchString(text) {
		return "", false
	}

	return text, true
}

func negative(text string) bool {
	if !strings.HasPrefix(text, "-") {
		return false
	}

	mantissa, _, _ := strings.Cut(strings.ToLower(text), "e")

	return strings.Trim(mantissa, "-0.") != ""
}

// millis turns a Convex time (milliseconds, may have a fraction) into UTC.
func millis(value any) (time.Time, bool) {
	number, ok := value.(json.Number)
	if !ok {
		return time.Time{}, false
	}

	ms, err := number.Float64()
	if err != nil || math.IsNaN(ms) || math.IsInf(ms, 0) || math.Abs(ms) > 1e14 {
		return time.Time{}, false
	}

	return time.UnixMicro(int64(math.Round(ms * 1000))).UTC(), true
}

// idsOf collects the _id of each document.
func idsOf(docs []doc) idSet {
	ids := idSet{}

	for _, d := range docs {
		if id, ok := d["_id"].(string); ok {
			ids[id] = true
		}
	}

	return ids
}

// snapshotColumns renames a collector snapshot's Convex keys to the Go column
// names. Documents merges this JSON over the collector row by key, so a
// camelCase key would never replace anything.
var snapshotColumns = map[string]string{
	"name": "name", "email": "email", "phone": "phone", "city": "city",
	"province": "province", "streetAddress": "street_address", "areaCode": "area_code",
	"payoutMethod": "payout_method", "bankAccountHolderName": "bank_account_holder_name",
	"bankName": "bank_name", "bankAccountNumber": "bank_account_number",
	"bankBranchCode": "bank_branch_code", "bankAccountType": "bank_account_type",
	"ewalletPlatformName": "ewallet_platform_name", "ewalletPaymentId": "ewallet_payment_id",
}

// list reads an array of objects (items, receiptAttachments). Absent is an
// empty list; the wrong shape is a problem.
func (r *row) list(key string) []doc {
	value, present := r.d[key]
	if !present || value == nil {
		return nil
	}

	items, ok := value.([]any)
	if !ok {
		r.fail(key, "must be a list")

		return nil
	}

	out := make([]doc, 0, len(items))

	for i, item := range items {
		object, ok := item.(map[string]any)
		if !ok {
			r.fail(fmt.Sprintf("%s[%d]", key, i), "must be an object")

			continue
		}

		out = append(out, doc(object))
	}

	return out
}

// child checks one element of a list. Its problems still name the parent _id,
// and the field says which element.
func (r *row) child(table, key string, i int, d doc) *row {
	return &row{rep: r.rep, table: table, id: r.id, d: d, prefix: fmt.Sprintf("%s[%d].", key, i)}
}

// without removes the id column from a built row, for tables that have none.
func without(out store.Row) store.Row {
	delete(out, "id")

	return out
}
