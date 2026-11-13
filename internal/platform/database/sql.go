package database

// DisplayName is the SQL for the name other people see for a user row aliased
// as alias. It never falls back to the email, so a name shown on screen can't
// leak an address.
func DisplayName(alias string) string {
	return "COALESCE(NULLIF((SELECT business_name FROM businesses WHERE id=" + alias + ".id), ''), " +
		"NULLIF(btrim(concat_ws(' ', " + alias + ".first_name, " + alias + ".last_name)), ''), " +
		"NULLIF(" + alias + ".name, ''), 'Unknown')"
}

// Verified is the SQL boolean for whether the business user row aliased as alias
// has been verified by 3REco. It is computed from the stored timestamp, never
// kept as a second copy.
func Verified(alias string) string {
	return "EXISTS(SELECT 1 FROM businesses WHERE id=" + alias + ".id AND business_verified_at IS NOT NULL)"
}

// PersonName is the name to show for the person behind a user row aliased as
// alias, in admin lists: admin and staff by their own first and last name (a
// business name left over from an earlier role is not theirs), everyone else
// as DisplayName does. It never falls back to the email.
func PersonName(alias string) string {
	return "CASE WHEN " + alias + ".role IN ('admin', 'staff') THEN " +
		"COALESCE(NULLIF(btrim(concat_ws(' ', " + alias + ".first_name, " + alias + ".last_name)), ''), " +
		"NULLIF(" + alias + ".name, ''), 'Unknown') ELSE " + DisplayName(alias) + " END"
}

// EffectiveDate is the SQL for the day a transaction row aliased as alias
// counts on. A collection day is midnight in South Africa; a collection date
// counts on its South African day; everything else counts on the South African
// day it was created. Every branch is that day's midnight, so rows on the same
// day tie and the created time (the caller's next sort key) puts the newest
// first. A raw created time here would sort above same-day midnight rows.
func EffectiveDate(alias string) string {
	const zone = "'Africa/Johannesburg'"

	return "CASE " +
		"WHEN " + alias + ".type = 'c2b' AND " + alias + ".collection_day IS NOT NULL " +
		"THEN (" + alias + ".collection_day::timestamp AT TIME ZONE " + zone + ") " +
		"WHEN " + alias + ".type = 'c2b' AND " + alias + ".collection_date IS NOT NULL " +
		"THEN (((" + alias + ".collection_date AT TIME ZONE " + zone + ")::date)::timestamp " +
		"AT TIME ZONE " + zone + ") " +
		"ELSE (((" + alias + ".created_at AT TIME ZONE " + zone + ")::date)::timestamp " +
		"AT TIME ZONE " + zone + ") END"
}

// Party is a person as other people may see them: an id and a safe name.
// Verified is true for a business 3REco has verified; it is computed, never stored.
type Party struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Verified bool   `json:"business_verified"`
}

// TradeVerified is the SQL boolean for whether the business that decides a
// transaction row (alias t) is verified: the buyer (b) in a collection and the
// seller (s) in a business trade. Verifying the business clears the mark on old
// trades too.
func TradeVerified() string {
	return "CASE WHEN t.type = 'b2b' THEN s.business_verified_at IS NOT NULL " +
		"ELSE b.business_verified_at IS NOT NULL END"
}
