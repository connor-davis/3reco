package tests

import (
	"context"
	"strings"
	"testing"

	collectorsstore "github.com/connor-davis/3reco/internal/stores/collectors"
	profilestore "github.com/connor-davis/3reco/internal/stores/profile"
	tstore "github.com/connor-davis/3reco/internal/stores/transactions"
	"github.com/connor-davis/3reco/tests/testutil"
)

// tradeBackfillLast4 fills the stored last-four columns of numbers a test sealed
// straight into the database, the way the server does at start-up.
func tradeBackfillLast4(t *testing.T, app *testutil.App) {
	t.Helper()

	cipher := testutil.Cipher(t)
	if _, err := profilestore.New(app.DB, cipher).BackfillLast4(context.Background()); err != nil {
		t.Fatal(err)
	}

	if _, err := collectorsstore.New(app.DB, cipher).BackfillLast4(context.Background()); err != nil {
		t.Fatal(err)
	}
}

// payoutFull reads a document with the seller's payout whole.
func payoutFull(tstore.Transaction) (tstore.Payout, error) { return tstore.PayoutFull, nil }

// inPDF turns a mask into the bytes the invoice PDF holds: its Latin-1 font
// writes each bullet as the single byte 0x95.
func inPDF(mask string) []byte { return []byte(strings.ReplaceAll(mask, "•", "\x95")) }
