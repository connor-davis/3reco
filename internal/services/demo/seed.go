// Package demo fills an empty demo database with made-up data. It goes
// through the real routes of a server running on this machine, so stock rules,
// the request state machine, invoices and audit lines all run as they do live.
package demo

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/services/auth"
	materialssvc "github.com/connor-davis/3reco/internal/services/materials"
	authstore "github.com/connor-davis/3reco/internal/stores/auth"
	store "github.com/connor-davis/3reco/internal/stores/demo"
)

// Seeder makes the demo data. BaseURL is a server that is already running
// against the same database with the same config.
type Seeder struct {
	Config  config.Config
	BaseURL string
	Auth    *auth.Service
	// Materials makes the catalog directly: the demo server refuses the admin routes.
	Materials *materialssvc.Service
	Users     *authstore.Store
	Store     *store.Store

	phones int
}

// account is a seeded login: the browser that is signed in, and its id.
type account struct {
	id string
	c  *client
}

// listing is one stock row a trade can use.
type listing struct {
	id, materialID, price string
}

// Seed fills the database. It refuses unless the demo flag is on and the
// database has no users, so it can never add dummy people to a real one. The
// caller checks the database and bucket names (Config.CheckDemo) first.
func (s *Seeder) Seed(ctx context.Context) error {
	if !s.Config.Demo {
		return errors.New("demo seed needs THREERECO_DEMO=true")
	}

	users, err := s.Store.UserCount(ctx)
	if err != nil {
		return err
	}

	if users > 0 {
		return errors.New("demo seed only runs on an empty database")
	}

	mats, err := s.seedMaterials(ctx)
	if err != nil {
		return err
	}

	people, err := s.seedPeople(ctx)
	if err != nil {
		return err
	}

	listings, err := s.seedStock(mats, people)
	if err != nil {
		return err
	}

	if err := s.seedTrades(people, listings); err != nil {
		return err
	}

	if err := s.seedCollections(mats, people); err != nil {
		return err
	}

	return s.seedExtras(mats, people, listings)
}

// seedMaterials makes the catalog as an admin whose password is thrown away.
// It uses the service, not the routes, because the demo refuses /api/admin.
func (s *Seeder) seedMaterials(ctx context.Context) (map[string]string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}

	password := hex.EncodeToString(raw)

	if err := s.Auth.CreateAdmin(ctx, "Demo Admin", adminEmail, password); err != nil {
		return nil, err
	}

	role := auth.RoleAdmin
	admin := authstore.User{Role: &role}
	ids := map[string]string{}

	for _, m := range materials {
		price := money(m.cents)
		id, err := s.Materials.Save(ctx, admin, "", materialssvc.Input{
			Name: &m.name, CarbonFactor: &m.carbon, GWCode: &m.code, Price: &price,
		})
		if err != nil {
			return nil, err
		}

		ids[m.name] = id
	}

	return ids, nil
}

// seedPeople signs everyone up through the service (the web sign-up is off in
// the demo), verifies them, and finishes their profile and role by the routes.
func (s *Seeder) seedPeople(ctx context.Context) (map[string]*account, error) {
	people := map[string]*account{}

	list := []person{buyerPerson, sellerPerson, collectorBusinessPerson}
	list = append(list, backgroundPeople...)

	for _, p := range list {
		acc, err := s.person(ctx, p, "")
		if err != nil {
			return nil, fmt.Errorf("%s: %w", p.key, err)
		}

		people[p.key] = acc
	}

	// The collector login shares a phone with one collector record, so the
	// business's collections show up on the collector's own page.
	collectorPhone := s.nextPhone()

	records := []map[string]any{
		{"name": "Nomsa Demo", "email": "nomsa@demo.test"},
		{"name": "Jabu Demo", "phone": s.nextPhone()},
		{
			"name": "Zanele Demo", "email": "zanele@demo.test", "phone": collectorPhone,
			"payout_method": "bank", "bank_account_holder_name": "Zanele Demo",
			"bank_name": "Demo Bank", "bank_account_number": fakeBankNumber,
			"bank_branch_code": "250655", "bank_account_type": "Cheque",
		},
	}

	for _, record := range records {
		record["street_address"] = "5 Demo Street"
		record["city"] = "Soweto"
		record["province"] = "Gauteng"
		record["area_code"] = 1818

		id, err := people["collector_business"].c.created("POST", "/api/collectors", record)
		if err != nil {
			return nil, fmt.Errorf("collector record: %w", err)
		}

		people["record:"+record["name"].(string)] = &account{id: id}
	}

	acc, err := s.person(ctx, collectorPerson, collectorPhone)
	if err != nil {
		return nil, fmt.Errorf("collector: %w", err)
	}

	people[collectorPerson.key] = acc

	if err := s.Store.VerifyBusinesses(ctx); err != nil {
		return nil, err
	}

	return people, nil
}

// person is the real path: sign up, verify, sign in, profile, business, role.
func (s *Seeder) person(ctx context.Context, p person, phone string) (*account, error) {
	name := p.first + " " + p.last

	if err := s.Auth.SignUp(ctx, name, p.email, Password, config.NoticeVersion); err != nil {
		return nil, err
	}

	user, err := s.Users.UserByEmail(ctx, p.email)
	if err != nil {
		return nil, err
	}

	if err := s.Users.MarkVerified(ctx, user.ID); err != nil {
		return nil, err
	}

	c := newClient(s.BaseURL, s.Config.WebOrigin)
	login := map[string]string{"email": p.email, "password": Password}

	if err := c.call("POST", "/api/auth/sign-in", login, nil); err != nil {
		return nil, err
	}

	if phone == "" {
		phone = s.nextPhone()
	}

	bank := map[string]any{
		"bank_account_holder_name": name, "bank_name": "Demo Bank",
		"bank_account_number": fakeBankNumber, "bank_branch_code": "250655",
		"bank_account_type": "Cheque",
	}
	address := map[string]any{
		"street_address": "12 Demo Road", "city": p.city, "province": p.province,
		"area_code": 2000,
	}

	profile := map[string]any{"first_name": p.first, "last_name": p.last, "phone": phone}

	// A business keeps its address and bank on the business, not the person.
	if p.business == "" {
		profile = merge(profile, address, bank)
	}

	if err := c.call("PATCH", "/api/profile", profile, nil); err != nil {
		return nil, err
	}

	if p.business != "" {
		s.phones++

		firm := merge(address, bank, map[string]any{
			"business_name":                p.business,
			"business_registration_number": fmt.Sprintf("2020/%06d/07", s.phones),
		})

		if err := c.call("PATCH", "/api/business", firm, nil); err != nil {
			return nil, err
		}
	}

	if err := c.call("POST", "/api/profile/setup", map[string]string{"role": p.role}, nil); err != nil {
		return nil, err
	}

	return &account{id: user.ID, c: c}, nil
}

// nextPhone gives a South African looking number that belongs to nobody.
func (s *Seeder) nextPhone() string {
	s.phones++

	return fmt.Sprintf("0825550%03d", s.phones)
}

func merge(parts ...map[string]any) map[string]any {
	out := map[string]any{}

	for _, part := range parts {
		maps.Copy(out, part)
	}

	return out
}

// money writes cents as an exact decimal string.
func money(cents int) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }
