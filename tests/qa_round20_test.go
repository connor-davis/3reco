package tests

import (
	"strings"
	"testing"
)

// TestEraseKeepsChatEventsWithoutTheName: removing a person blanks the words
// they typed, but the app's own event lines for their actions stay readable,
// with "Removed account" in place of their name.
func TestEraseKeepsChatEventsWithoutTheName(t *testing.T) {
	w := newTradeWorld(t)
	request := tradeRequest(t, w.buyer, w.seller, w.stock)
	name := tradeText(t, w.app, `SELECT business_name FROM businesses WHERE id=$1`, w.buyer.id)

	tradeExec(t, w.app, `INSERT INTO transaction_request_messages (id, request_id, sender_id, content, system)
		VALUES ('r20typed', $1, $2, 'call me on 082 000 0000', false)`, request, w.buyer.id)

	status(t, w.buyer.c.Do("POST", "/api/privacy/delete", map[string]any{"password": goodPassword}), 200)

	event := tradeText(t, w.app, `SELECT content FROM transaction_request_messages
		WHERE request_id=$1 AND sender_id=$2 AND system ORDER BY created_at LIMIT 1`, request, w.buyer.id)
	if !strings.HasPrefix(event, "Removed account requested ") || strings.Contains(event, name) {
		t.Errorf("event line after removal: %q", event)
	}

	if got := tradeText(t, w.app, `SELECT content FROM transaction_request_messages WHERE id='r20typed'`); got != "[removed]" {
		t.Errorf("typed message after removal: %q", got)
	}
}
