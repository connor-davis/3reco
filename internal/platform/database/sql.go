package database

// DisplayName is the SQL for the name other people see for a user row aliased
// as alias. It never falls back to the email, so a name shown on screen can't
// leak an address.
func DisplayName(alias string) string {
	return "COALESCE(NULLIF(" + alias + ".business_name, ''), " +
		"NULLIF(btrim(concat_ws(' ', " + alias + ".first_name, " + alias + ".last_name)), ''), " +
		"NULLIF(" + alias + ".name, ''), 'Unknown')"
}

// EffectiveDate is the SQL for the day a transaction row aliased as alias
// counts on. A collection day is midnight in South Africa; a collection date
// counts on its South African day; everything else uses the created time.
func EffectiveDate(alias string) string {
	const zone = "'Africa/Johannesburg'"

	return "CASE " +
		"WHEN " + alias + ".type = 'c2b' AND " + alias + ".collection_day IS NOT NULL " +
		"THEN (" + alias + ".collection_day::timestamp AT TIME ZONE " + zone + ") " +
		"WHEN " + alias + ".type = 'c2b' AND " + alias + ".collection_date IS NOT NULL " +
		"THEN (((" + alias + ".collection_date AT TIME ZONE " + zone + ")::date)::timestamp " +
		"AT TIME ZONE " + zone + ") " +
		"ELSE " + alias + ".created_at END"
}

// Party is a person as other people may see them: an id and a safe name.
type Party struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
