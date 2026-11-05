// Package importer moves a `npx convex export` into the empty 3REco database
// and MinIO, once. It reads the whole export and checks every row first; if
// any row breaks a rule it writes nothing and lists every bad row.
package importer

import (
	"context"
	"fmt"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	store "github.com/connor-davis/3reco/internal/stores/importer"
)

// InvalidError means the export has rows that break a rule. Nothing was written.
type InvalidError struct {
	Count int
}

// Error says how many rows were refused.
func (e *InvalidError) Error() string {
	return fmt.Sprintf("the export has %d bad rows; nothing was imported", e.Count)
}

// requiredTables are the Convex tables the import cannot do without.
// ponytail: the names of users, user and account are the documented ones.
// Check them (and where Better Auth's tables sit) against a real export.
var requiredTables = []string{
	"users", "user", "account", "collectors", "materials", "stock", "transactions",
	"transactionRequests", "transactionRequestMessages", "notifications", "carts",
	"storeReviews",
}

// planner holds everything worked out from the export before any write.
type planner struct {
	a         *archive
	rep       *Report
	docs      map[string][]doc
	rows      map[string][]store.Row
	blobs     []blob
	removedBy []store.RemovedBy

	users, collectors, materials, stock, transactions, requests idSet

	// storage is the export's own record of each stored file, by storage id.
	storage map[string]doc

	// requestParties is seller and buyer by request id, to find who reads a message.
	requestParties map[string][2]string
}

// Run reads the export and loads it. It returns the report in every case
// where it got that far, so the caller can print the counts or the bad rows.
func Run(
	ctx context.Context,
	db *database.DB,
	objects *storage.Client,
	zipPath string,
) (*Report, error) {
	rows := store.New(db)

	// Cheap and first: a second run should not have to read a big ZIP to be told no.
	if err := rows.EnsureEmpty(ctx); err != nil {
		return nil, err
	}

	a, err := openArchive(zipPath)
	if err != nil {
		return nil, err
	}
	defer a.Close()

	rep := newReport()
	p := &planner{a: a, rep: rep}

	if err := p.plan(); err != nil {
		return rep, err
	}

	// Strict: one bad row and nothing is written.
	if len(rep.Problems) > 0 {
		return rep, &InvalidError{Count: len(rep.Problems)}
	}

	if err := objects.EnsureBucket(ctx); err != nil {
		return rep, fmt.Errorf("storage: %w", err)
	}

	// Files go first because rows point at them. A rollback removes them again.
	uploaded, err := p.upload(ctx, objects)
	if err != nil {
		removeObjects(ctx, objects, uploaded)

		return rep, err
	}

	err = db.InTx(ctx, func(ctx context.Context) error { return p.load(ctx, rows) })
	if err != nil {
		removeObjects(ctx, objects, uploaded)

		return rep, err
	}

	return rep, nil
}

// plan reads every table and maps it to rows. Problems go to the report.
func (p *planner) plan() error {
	missing := false

	for _, table := range requiredTables {
		if _, err := p.a.findTable(table); err != nil {
			p.rep.problem(table, "-", "-", err.Error())

			missing = true
		}
	}

	if missing {
		return nil
	}

	p.docs = map[string][]doc{}
	p.rows = map[string][]store.Row{}

	for _, table := range requiredTables {
		docs, err := p.a.documents(table)
		if err != nil {
			return err
		}

		p.docs[table] = docs
	}

	// ponytail: _storage/documents.jsonl is optional here. It only feeds a
	// sha256 and size cross-check; check its name against a real export.
	p.storage = map[string]doc{}

	if _, err := p.a.findTable("_storage"); err == nil {
		records, err := p.a.documents("_storage")
		if err != nil {
			return err
		}

		for _, record := range records {
			p.storage[str(record["_id"])] = record
		}
	}

	p.collectors, p.materials = idsOf(p.docs["collectors"]), idsOf(p.docs["materials"])
	p.stock, p.transactions = idsOf(p.docs["stock"]), idsOf(p.docs["transactions"])
	p.requests = idsOf(p.docs["transactionRequests"])
	p.requestParties = map[string][2]string{}

	p.planUsers()
	p.planCollectors()
	p.planMaterials()
	p.planStock()
	p.planTransactions()
	p.planRequests()
	p.planNotifications()
	p.planCarts()
	p.planReviews()

	return nil
}

// load writes every table in foreign-key order, inside the caller's transaction.
func (p *planner) load(ctx context.Context, rows *store.Store) error {
	if err := rows.Begin(ctx); err != nil {
		return err
	}

	for _, table := range tableOrder {
		if err := rows.Insert(ctx, store.Batch{Table: table, Rows: p.rows[table]}); err != nil {
			return err
		}

		// removed_by points at other users, so it waits until all of them exist.
		if table == "users" {
			if err := rows.SetRemovedBy(ctx, p.removedBy); err != nil {
				return err
			}
		}
	}

	tables := make([]TableCount, 0, len(tableOrder))

	for _, table := range tableOrder {
		loaded, err := rows.Count(ctx, table)
		if err != nil {
			return err
		}

		tables = append(tables, TableCount{Table: table, Source: len(p.rows[table]), Loaded: loaded})
	}

	p.rep.Tables = tables

	return rows.Finish(ctx)
}
