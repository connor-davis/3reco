package importer

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	store "github.com/connor-davis/3reco/internal/stores/importer"
)

const (
	removedName    = "Removed account"
	maxAvatarBytes = 2 << 20
)

var (
	roles     = []string{"guest", "admin", "staff", "business", "collector"}
	provinces = []string{
		"Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
		"Mpumalanga", "Northern Cape", "North West", "Western Cape",
	}
	accountTypes = []string{"Cheque", "Savings", "Transmission"}
)

// userFields are the Convex users that copy straight across. The login
// fields (email, password, verification, picture) are handled in planUsers.
var userFields = []field{
	{col: "name", key: "name", kind: kText},
	{col: "phone", key: "phone", kind: kText},
	{col: "normalized_phone", key: "normalizedPhone", kind: kText},
	{col: "role", key: "role", kind: kText, oneOf: roles},
	{col: "profile_complete", key: "profileComplete", kind: kBool},
	{col: "agreed_to_terms", key: "agreedToTerms", kind: kBool},
	{col: "first_name", key: "firstName", kind: kText},
	{col: "last_name", key: "lastName", kind: kText},
	{col: "id_number", key: "idNumber", kind: kText},
	{col: "business_name", key: "businessName", kind: kText},
	{col: "business_registration_number", key: "businessRegistrationNumber", kind: kText},
	{col: "bank_account_holder_name", key: "bankAccountHolderName", kind: kText},
	{col: "bank_name", key: "bankName", kind: kText},
	{col: "bank_account_number", key: "bankAccountNumber", kind: kText},
	{col: "bank_branch_code", key: "bankBranchCode", kind: kText},
	{col: "bank_account_type", key: "bankAccountType", kind: kText, oneOf: accountTypes},
	{col: "street_address", key: "streetAddress", kind: kText},
	{col: "city", key: "city", kind: kText},
	{col: "area_code", key: "areaCode", kind: kInt},
	{col: "province", key: "province", kind: kText, oneOf: provinces},
	{col: "removed_at", key: "removedAt", kind: kTime},
}

// planUsers joins the app users with the Better Auth users and passwords.
// The app user's _id becomes users.id, because every other table points at it.
func (p *planner) planUsers() {
	appUsers, authUsers, accounts := p.docs["users"], p.docs["user"], p.docs["account"]

	matches := p.joinAuthUsers(appUsers, authUsers)
	credentials := p.credentialAccounts(accounts)
	seenEmail := map[string]string{}
	rows := make([]store.Row, 0, len(appUsers)+len(authUsers))

	for _, app := range appUsers {
		r := newRow(p.rep, "users", app)
		out := r.build(userFields)
		p.seal(r, out, "id_number", "bank_account_number")
		r.created(out, true)

		auth := matches.authFor[r.id]
		p.userLogin(r, out, app, auth, credentials, seenEmail)
		rows = append(rows, out)
	}

	for _, auth := range authUsers {
		id, _ := auth["_id"].(string)
		if matches.used[id] {
			continue
		}

		// A Better Auth person with no app row: keep them so they can sign in
		// and finish their profile. Nothing else points at this id.
		p.rep.note("users from a login with no app profile")

		r := newRow(p.rep, "user", auth)
		out := store.Row{"id": id, "name": r.text("name")}
		r.created(out, true)
		p.userLogin(r, out, nil, auth, credentials, seenEmail)
		rows = append(rows, out)
	}

	for _, person := range rows {
		if person["role"] == "business" {
			business := store.Row{"id": person["id"], "created_at": person["created_at"], "updated_at": person["updated_at"]}
			for _, column := range []string{"business_name", "business_registration_number",
				"bank_account_holder_name", "bank_name", "bank_account_number", "bank_branch_code",
				"bank_account_type", "street_address", "city", "area_code", "province", "avatar_key", "image"} {
				if value, ok := person[column]; ok {
					business[column] = value
				}

				if column != "avatar_key" && column != "image" {
					delete(person, column)
				}
			}

			p.rows["businesses"] = append(p.rows["businesses"], business)
			p.rows["business_members"] = append(p.rows["business_members"], store.Row{
				"business_id": person["id"], "user_id": person["id"], "role": "owner",
			})
		}

		delete(person, "business_name")
		delete(person, "business_registration_number")
	}

	p.rows["users"] = rows
	p.users = idsOf(docsFromRows(rows))

	// removed_by points at a user, which may be listed after the removed one.
	for _, update := range p.removedBy {
		if !p.users[update.RemovedBy] {
			p.rep.problem("users", update.UserID, "removedBy", "no user with id \""+update.RemovedBy+"\"")
		}
	}
}

// docsFromRows lets idsOf read the ids of rows already built.
func docsFromRows(rows []store.Row) []doc {
	out := make([]doc, 0, len(rows))

	for _, built := range rows {
		out = append(out, doc{"_id": built["id"]})
	}

	return out
}

// userLogin fills email, verification, password and picture, and applies the
// removed-account rules. app is nil for a login with no profile; auth is nil
// for a profile with no login.
func (p *planner) userLogin(
	r *row,
	out store.Row,
	app, auth doc,
	credentials map[string][]doc,
	seenEmail map[string]string,
) {
	removed := app != nil && app["isRemoved"] == true

	if removed {
		p.removedUser(r, out)

		return
	}

	email := rowText(app, "email")

	if auth != nil {
		authEmail := str(auth["email"])

		if email != "" && !strings.EqualFold(email, authEmail) {
			p.rep.note("users whose profile email differs from the login email (login email kept)")
		}

		email = authEmail
	}

	if email != "" {
		key := strings.ToLower(email)

		if other, dup := seenEmail[key]; dup {
			r.fail("email", "same email as user "+other+" (ignoring case)")
		}

		seenEmail[key] = r.id
		out["email"] = email
	}

	verified := auth != nil && auth["emailVerified"] == true
	if app != nil && app["emailVerificationTime"] != nil {
		verified = true

		if when, ok := millis(app["emailVerificationTime"]); ok {
			out["email_verified_at"] = when
		}
	}

	out["email_verified"] = verified

	p.userPassword(r, out, auth, credentials)
	p.userPicture(r, out, app, auth)

	if app != nil && app["isAnonymous"] == true {
		p.rep.note("users flagged anonymous in Convex")
	}
}

// removedUser blanks a removed account the way the Go removal does, and
// queues removed_by for after every user exists.
func (p *planner) removedUser(r *row, out store.Row) {
	cleaned := store.Row{
		"id": r.id, "name": removedName, "business_name": removedName,
		"is_removed": true, "created_at": out["created_at"], "updated_at": out["updated_at"],
	}

	if when, ok := out["removed_at"]; ok {
		cleaned["removed_at"] = when
	}

	clear(out)

	for column, value := range cleaned {
		out[column] = value
	}

	if by := r.text("removedBy"); by != "" {
		p.removedBy = append(p.removedBy, store.RemovedBy{UserID: r.id, RemovedBy: by})
	}
}

// userPassword copies the Better Auth scrypt hash as it is. The sign-in code
// upgrades it to argon2id the first time the person gets in.
func (p *planner) userPassword(r *row, out store.Row, auth doc, credentials map[string][]doc) {
	if auth == nil {
		p.rep.note("users with no login (they must use forgot password)")

		return
	}

	authID, _ := auth["_id"].(string)
	list := credentials[authID]

	switch {
	case len(list) == 0:
		p.rep.note("users with no login (they must use forgot password)")
	case len(list) > 1:
		r.fail("account", "more than one credential account for login "+authID)
	default:
		hash, _ := list[0]["password"].(string)
		salt, key, found := strings.Cut(hash, ":")

		if !found || !isHex(salt) || !isHex(key) {
			r.fail("password", "is not a <saltHex>:<keyHex> hash")

			return
		}

		out["password_hash"] = hash
	}
}

func isHex(text string) bool {
	_, err := hex.DecodeString(text)

	return text != "" && err == nil
}

// userPicture keeps a web address in image. A data: picture is checked and
// moved to MinIO as an avatar; a bad one is dropped, since the account is fine.
func (p *planner) userPicture(r *row, out store.Row, app, auth doc) {
	image := rowText(app, "image")
	if image == "" && auth != nil {
		image, _ = auth["image"].(string)
	}

	if image == "" {
		return
	}

	if !strings.HasPrefix(image, "data:") {
		out["image"] = image

		return
	}

	meta, payload, _ := strings.Cut(strings.TrimPrefix(image, "data:"), ",")
	if !strings.HasSuffix(meta, ";base64") || len(payload) > 3*maxAvatarBytes/2 {
		p.rep.note("avatars skipped (bad data URL)")

		return
	}

	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		p.rep.note("avatars skipped (bad data URL)")

		return
	}

	data, contentType, err := storage.Image(bytes.NewReader(decoded), maxAvatarBytes, true)
	if err != nil {
		p.rep.note("avatars skipped (not a PNG, JPEG or WEBP under 2 MiB)")

		return
	}

	key := "avatars/" + r.id + "/" + database.NewID()
	out["avatar_key"] = key
	p.blobs = append(p.blobs, blob{key: key, contentType: contentType, data: data})
}

// rowText reads a string from a possibly missing document.
func rowText(d doc, key string) string {
	if d == nil {
		return ""
	}

	text, _ := d[key].(string)

	return text
}

// authMatches is the result of the join: which login belongs to which profile.
type authMatches struct {
	authFor map[string]doc  // app user id -> Better Auth user
	used    map[string]bool // Better Auth user ids that found a profile
}

// joinAuthUsers pairs each Better Auth user with one app user. The steps run
// in order and the first one that finds anybody decides: authId, authSubject,
// the end of tokenIdentifier, then the email. Two candidates is an error.
func (p *planner) joinAuthUsers(appUsers, authUsers []doc) authMatches {
	byAuthID, bySubject, byToken, byEmail := map[string][]string{}, map[string][]string{},
		map[string][]string{}, map[string][]string{}

	for _, app := range appUsers {
		id, _ := app["_id"].(string)

		addIndex(byAuthID, str(app["authId"]), id)
		addIndex(bySubject, str(app["authSubject"]), id)

		if _, subject, found := strings.Cut(str(app["tokenIdentifier"]), "|"); found {
			addIndex(byToken, subject, id)
		}

		if app["isRemoved"] != true {
			addIndex(byEmail, strings.ToLower(str(app["email"])), id)
		}
	}

	result := authMatches{authFor: map[string]doc{}, used: map[string]bool{}}

	for _, auth := range authUsers {
		authID := str(auth["_id"])

		candidates := firstHit(authID, strings.ToLower(str(auth["email"])), byAuthID, bySubject, byToken, byEmail)
		switch len(candidates) {
		case 0:
			continue
		case 1:
			if _, taken := result.authFor[candidates[0]]; taken {
				p.rep.problem("users", candidates[0], "login", "two Better Auth users match this profile")

				continue
			}

			result.authFor[candidates[0]] = auth
			result.used[authID] = true
		default:
			p.rep.problem("user", authID, "profile", "matches more than one app user: "+strings.Join(candidates, ", "))
		}
	}

	return result
}

// firstHit returns the app users found by the first join step that finds any.
func firstHit(authID, email string, byAuthID, bySubject, byToken, byEmail map[string][]string) []string {
	for _, step := range []struct {
		index map[string][]string
		value string
	}{{byAuthID, authID}, {bySubject, authID}, {byToken, authID}, {byEmail, email}} {
		if step.value != "" && len(step.index[step.value]) > 0 {
			return step.index[step.value]
		}
	}

	return nil
}

func addIndex(index map[string][]string, key, id string) {
	if key == "" {
		return
	}

	for _, existing := range index[key] {
		if existing == id {
			return
		}
	}

	index[key] = append(index[key], id)
}

func str(value any) string {
	text, _ := value.(string)

	return text
}

// credentialAccounts groups the email-and-password accounts by Better Auth
// user. Other kinds of account (Google and so on) are counted and dropped.
func (p *planner) credentialAccounts(accounts []doc) map[string][]doc {
	out := map[string][]doc{}

	for _, account := range accounts {
		if str(account["providerId"]) != "credential" {
			p.rep.note("login accounts that are not email and password (not imported)")

			continue
		}

		out[str(account["userId"])] = append(out[str(account["userId"])], account)
	}

	return out
}
