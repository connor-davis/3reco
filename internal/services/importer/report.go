package importer

import (
	"fmt"
	"io"
	"sort"
)

// Problem is one export row that breaks a rule. Strict mode refuses the whole
// import when there is any.
type Problem struct {
	Table  string
	ID     string
	Field  string
	Reason string
}

// TableCount is what the importer planned for a table and what the database
// holds after the load. The two must match.
type TableCount struct {
	Table  string
	Source int
	Loaded int
}

// Report is everything the import has to tell the owner.
type Report struct {
	Tables   []TableCount
	Problems []Problem
	// Notes count things that were skipped or changed on purpose, by name.
	Notes map[string]int
}

// tableOrder is the load order (foreign keys decide it) and the print order.
var tableOrder = []string{
	"users", "collectors", "materials", "stock", "transactions", "transaction_items",
	"transaction_receipts", "transaction_requests", "transaction_request_items",
	"transaction_request_messages", "request_message_reads", "notifications",
	"carts", "cart_items", "store_reviews",
}

func newReport() *Report {
	return &Report{Notes: map[string]int{}}
}

func (r *Report) problem(table, id, field, reason string) {
	r.Problems = append(r.Problems, Problem{Table: table, ID: id, Field: field, Reason: reason})
}

func (r *Report) note(what string) {
	r.Notes[what]++
}

// Print writes the counts, the notes and every problem.
func (r *Report) Print(w io.Writer) {
	if len(r.Tables) > 0 {
		fmt.Fprintf(w, "%-30s %8s %8s\n", "table", "source", "loaded")

		for _, count := range r.Tables {
			fmt.Fprintf(w, "%-30s %8d %8d\n", count.Table, count.Source, count.Loaded)
		}
	}

	names := make([]string, 0, len(r.Notes))
	for name := range r.Notes {
		names = append(names, name)
	}

	sort.Strings(names)

	for _, name := range names {
		fmt.Fprintf(w, "note: %s: %d\n", name, r.Notes[name])
	}

	for _, problem := range r.Problems {
		fmt.Fprintf(w, "BAD ROW  table=%s _id=%s field=%s: %s\n",
			problem.Table, problem.ID, problem.Field, problem.Reason)
	}
}
