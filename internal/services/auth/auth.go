// Package auth is sign-up, sign-in, sessions, email checks and password reset.
// It replaces Better Auth: email and password only, with opaque session
// tokens in cookies and several accounts per browser.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	mailer "github.com/connor-davis/3reco/internal/platform/mail"
	store "github.com/connor-davis/3reco/internal/stores/auth"
)

// How long things last. Sessions and their sliding refresh match the old app.
const (
	SessionTTL  = 7 * 24 * time.Hour
	SlideAfter  = 24 * time.Hour
	VerifyTTL   = 72 * time.Hour
	ResetTTL    = time.Hour
	MinPassword = 8
	maxPassword = 128 // bounds the work one request can ask of the hasher
)

// Roles a user can have.
const (
	RoleAdmin     = "admin"
	RoleStaff     = "staff"
	RoleBusiness  = "business"
	RoleCollector = "collector"
)

const (
	kindVerify = "verify"
	kindReset  = "reset"
)

// Session and User are the store's types, re-exported so callers import one package.
type (
	Session = store.Session
	User    = store.User
)

// Service holds the auth rules.
type Service struct {
	db     *database.DB
	store  *store.Store
	mailer *mailer.Mailer
	cfg    config.Config
}

// New builds the service.
func New(db *database.DB, s *store.Store, m *mailer.Mailer, cfg config.Config) *Service {
	return &Service{db: db, store: s, mailer: m, cfg: cfg}
}

var errBadLogin = apperr.Unauthorized("Wrong email or password.")

// SignUp creates an account and sends the verification email. An email that is
// already registered looks the same to the caller, so the form cannot be used
// to find out who has an account.
func (s *Service) SignUp(ctx context.Context, name, email, password string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return apperr.Field("name", "Enter your name.")
	}

	email, err := cleanEmail(email)
	if err != nil {
		return err
	}

	if err := checkPassword(password); err != nil {
		return err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return err
	}

	user, err := s.store.CreateUser(ctx, store.NewUser{Name: name, Email: email, PasswordHash: hash})

	switch {
	case errors.Is(err, store.ErrEmailTaken):
		// Someone who never clicked the link can ask again by signing up again.
		return s.RequestVerification(ctx, email)
	case err != nil:
		return err
	}

	return s.sendVerification(ctx, user)
}

// SignIn checks the password and starts a session. It returns the cookie token.
func (s *Service) SignIn(
	ctx context.Context,
	email, password, ip, userAgent string,
) (string, store.User, error) {
	user, err := s.store.UserByEmail(ctx, strings.TrimSpace(email))
	if err != nil {
		return "", store.User{}, err
	}

	if user == nil || user.IsRemoved || user.PasswordHash == nil {
		burnPasswordCheck(password)

		return "", store.User{}, errBadLogin
	}

	ok, legacy := VerifyPassword(password, *user.PasswordHash)
	if !ok {
		return "", store.User{}, errBadLogin
	}

	if !user.EmailVerified {
		return "", store.User{}, apperr.Forbidden(
			"Please verify your email address first. We sent you a link.",
		).WithCode("email_not_verified")
	}

	// A Better Auth scrypt hash is replaced by argon2id on the first good login.
	if legacy {
		if upgraded, err := HashPassword(password); err == nil {
			if err := s.store.SetPassword(ctx, user.ID, upgraded); err != nil {
				slog.Warn("could not rehash password", "user", user.ID, "err", err)
			}
		}
	}

	token, hash := newToken()

	if err := s.store.CreateSession(ctx, user.ID, hash, ip, userAgent, SessionTTL); err != nil {
		return "", store.User{}, err
	}

	return token, *user, nil
}

// Authenticate turns a cookie token into its session. A session older than
// SlideAfter gets a fresh expiry; refreshed tells the caller to renew the cookie.
func (s *Service) Authenticate(
	ctx context.Context,
	token string,
) (sess store.Session, refreshed bool, err error) {
	sessions, err := s.store.SessionsByHashes(ctx, []string{hashToken(token)})
	if err != nil {
		return sess, false, err
	}

	if len(sessions) == 0 {
		return sess, false, apperr.Unauthorized("Please sign in.")
	}

	sess = sessions[0]

	if time.Since(sess.RefreshedAt) > SlideAfter {
		if err := s.store.SlideSession(ctx, sess.ID, SessionTTL); err != nil {
			return sess, false, err
		}

		return sess, true, nil
	}

	return sess, false, nil
}

// SessionByID loads one live session. The realtime hub uses it to check that a
// socket's session is still good.
func (s *Service) SessionByID(ctx context.Context, id string) (store.Session, error) {
	sess, err := s.store.SessionByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return sess, apperr.Unauthorized("Please sign in.")
	}

	return sess, err
}

// Devices lists the live sessions behind the tokens this browser holds.
func (s *Service) Devices(ctx context.Context, tokens []string) ([]store.Session, error) {
	if len(tokens) == 0 {
		return nil, nil
	}

	hashes := make([]string, len(tokens))
	for i, token := range tokens {
		hashes[i] = hashToken(token)
	}

	return s.store.SessionsByHashes(ctx, hashes)
}

// DeviceToken finds, among this browser's own tokens, the one for session id.
// A session this browser does not hold is never found, which is what keeps
// one user from switching to or revoking another's session.
func (s *Service) DeviceToken(ctx context.Context, tokens []string, id string) (string, bool, error) {
	sessions, err := s.Devices(ctx, tokens)
	if err != nil {
		return "", false, err
	}

	for _, sess := range sessions {
		if sess.ID != id {
			continue
		}

		for _, token := range tokens {
			if hashToken(token) == sess.TokenHash {
				return token, true, nil
			}
		}
	}

	return "", false, nil
}

// Revoke ends sessions of this browser by id. Ids that are not behind one of
// its tokens are ignored.
func (s *Service) Revoke(ctx context.Context, tokens []string, ids ...string) error {
	sessions, err := s.Devices(ctx, tokens)
	if err != nil {
		return err
	}

	var mine []string

	for _, sess := range sessions {
		if slices.Contains(ids, sess.ID) {
			mine = append(mine, sess.ID)
		}
	}

	if len(mine) == 0 {
		return nil
	}

	return s.store.DeleteSessions(ctx, mine)
}

// RequestVerification emails a new verification link. It says nothing about
// whether the address has an account.
func (s *Service) RequestVerification(ctx context.Context, email string) error {
	user, err := s.store.UserByEmail(ctx, strings.TrimSpace(email))
	if err != nil || user == nil || user.EmailVerified || user.IsRemoved {
		return err
	}

	return s.sendVerification(ctx, *user)
}

func (s *Service) sendVerification(ctx context.Context, user store.User) error {
	link, err := s.newLink(ctx, kindVerify, user.ID, VerifyTTL, "/verify-email")
	if err != nil {
		return err
	}

	s.mailer.SendAsync(mailer.ActionEmail(
		*user.Email,
		"Verify your 3rEco email address",
		"Verify your email address",
		"Click below to verify your email address and finish setting up your 3rEco account.",
		"Verify email",
		link,
	))

	return nil
}

// ConfirmVerification marks the email verified when the token is good.
func (s *Service) ConfirmVerification(ctx context.Context, token string) error {
	return s.db.InTx(ctx, func(ctx context.Context) error {
		userID, err := s.consume(ctx, kindVerify, token)
		if err != nil {
			return err
		}

		return s.store.MarkVerified(ctx, userID)
	})
}

// RequestReset emails a password reset link. It says nothing about whether the
// address has an account.
func (s *Service) RequestReset(ctx context.Context, email string) error {
	user, err := s.store.UserByEmail(ctx, strings.TrimSpace(email))
	if err != nil || user == nil || user.IsRemoved {
		return err
	}

	link, err := s.newLink(ctx, kindReset, user.ID, ResetTTL, "/reset-password")
	if err != nil {
		return err
	}

	s.mailer.SendAsync(mailer.ActionEmail(
		*user.Email,
		"Reset your 3rEco password",
		"Reset your 3rEco password",
		"We received a request to reset your password. Click below to choose a new one.",
		"Reset password",
		link,
	))

	return nil
}

// ConfirmReset sets a new password. Reading the emailed link proves the
// address, and every session of that user ends.
func (s *Service) ConfirmReset(ctx context.Context, token, password string) error {
	if err := checkPassword(password); err != nil {
		return err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return err
	}

	return s.db.InTx(ctx, func(ctx context.Context) error {
		userID, err := s.consume(ctx, kindReset, token)
		if err != nil {
			return err
		}

		if err := s.store.SetPassword(ctx, userID, hash); err != nil {
			return err
		}

		if err := s.store.MarkVerified(ctx, userID); err != nil {
			return err
		}

		return s.store.DeleteUserSessions(ctx, userID)
	})
}

// CreateAdmin makes (or promotes) a verified admin. The `admin create` command uses it.
func (s *Service) CreateAdmin(ctx context.Context, name, email, password string) error {
	email, err := cleanEmail(email)
	if err != nil {
		return err
	}

	if err := checkPassword(password); err != nil {
		return err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return err
	}

	existing, err := s.store.UserByEmail(ctx, email)
	if err != nil {
		return err
	}

	if existing != nil {
		return s.store.MakeAdmin(ctx, existing.ID, hash)
	}

	_, err = s.store.CreateUser(ctx, store.NewUser{
		Name: name, Email: email, PasswordHash: hash, Role: RoleAdmin, Verified: true,
	})

	return err
}

// Allow counts one request against key and says whether it is within max per minute.
func (s *Service) Allow(ctx context.Context, key string, limit int) (bool, error) {
	n, err := s.store.Hit(ctx, key)

	return n <= limit, err
}

// Purge deletes expired sessions, tokens and rate counts.
func (s *Service) Purge(ctx context.Context) error { return s.store.Purge(ctx) }

// HasRole reports whether the user's role is one of roles.
func HasRole(user store.User, roles ...string) bool {
	return user.Role != nil && slices.Contains(roles, *user.Role)
}

func (s *Service) newLink(
	ctx context.Context,
	kind, userID string,
	ttl time.Duration,
	path string,
) (string, error) {
	token, hash := newToken()

	if err := s.store.ReplaceToken(ctx, kind, userID, hash, ttl); err != nil {
		return "", err
	}

	return s.cfg.WebOrigin + path + "?token=" + token, nil
}

func (s *Service) consume(ctx context.Context, kind, token string) (string, error) {
	userID, err := s.store.ConsumeToken(ctx, kind, hashToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.BadRequest("This link is not valid any more. Ask for a new one.", nil)
	}

	return userID, err
}

// newToken returns a random cookie or link token and the hash that is stored.
func newToken() (token, hash string) {
	buf := make([]byte, 32)

	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}

	token = base64.RawURLEncoding.EncodeToString(buf)

	return token, hashToken(token)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))

	return hex.EncodeToString(sum[:])
}

func cleanEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || !strings.Contains(email[strings.LastIndex(email, "@"):], ".") {
		return "", apperr.Field("email", "Enter a valid email address.")
	}

	return email, nil
}

func checkPassword(password string) error {
	if len(password) < MinPassword {
		return apperr.Field("password", "Use at least 8 characters.")
	}

	if len(password) > maxPassword {
		return apperr.Field("password", "Use at most 128 characters.")
	}

	return nil
}
