package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"runtime"
	"strings"
	"sync"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/scrypt"
	"golang.org/x/text/unicode/norm"
)

// Argon2id costs for new hashes. They are stored in each hash, so they can be
// raised later and old hashes still verify.
const (
	argonMemory  = 64 * 1024 // KiB
	argonTime    = 3
	argonThreads = 2
	argonKeyLen  = 32
	argonSaltLen = 16
)

// Better Auth's scrypt costs. Hashes from the old app use exactly these.
const (
	legacyN      = 16384
	legacyR      = 16
	legacyP      = 1
	legacyKeyLen = 64
)

// slots caps how many hashes run at once. Each one needs tens of MiB, so a
// burst of sign-ups must queue instead of using all the memory.
var slots = make(chan struct{}, max(2, runtime.NumCPU()/2))

func acquire() func() {
	slots <- struct{}{}

	return func() { <-slots }
}

// HashPassword returns an argon2id hash in the PHC string format.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	defer acquire()()

	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	enc := base64.RawStdEncoding

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads, enc.EncodeToString(salt),
		enc.EncodeToString(key)), nil
}

// VerifyPassword checks a password against a stored hash. It reads both the
// argon2id hashes made here and the "<saltHex>:<keyHex>" scrypt hashes made by
// Better Auth. legacy is true for the latter: the caller should rehash.
func VerifyPassword(password, hash string) (ok, legacy bool) {
	if strings.HasPrefix(hash, "$argon2id$") {
		return verifyArgon(password, hash), false
	}

	return verifyLegacy(password, hash), true
}

func verifyArgon(password, hash string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 {
		return false
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}

	var memory, passes uint32

	var threads uint8

	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &passes, &threads); err != nil {
		return false
	}

	// A bad restore must not be able to ask for gigabytes or hours.
	if memory == 0 || memory > 256*1024 || passes == 0 || passes > 10 || threads == 0 || threads > 16 {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}

	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false
	}

	defer acquire()()

	got := argon2.IDKey([]byte(password), salt, passes, memory, threads, uint32(len(want)))

	return subtle.ConstantTimeCompare(got, want) == 1
}

// verifyLegacy checks a Better Auth hash. Its scrypt "salt" is the hex string
// itself (its UTF-8 bytes), not the bytes the hex stands for.
func verifyLegacy(password, hash string) bool {
	saltHex, keyHex, found := strings.Cut(hash, ":")
	if !found || saltHex == "" || keyHex == "" {
		return false
	}

	want, err := hex.DecodeString(keyHex)
	if err != nil || len(want) != legacyKeyLen {
		return false
	}

	defer acquire()()

	got, err := scrypt.Key(
		[]byte(norm.NFKC.String(password)), []byte(saltHex), legacyN, legacyR, legacyP, legacyKeyLen)
	if err != nil {
		return false
	}

	return subtle.ConstantTimeCompare(got, want) == 1
}

var (
	dummyOnce sync.Once
	dummyHash string
)

// burnPasswordCheck spends the time of a real check, so an unknown email
// answers as slowly as a wrong password and timing reveals nothing.
func burnPasswordCheck(password string) {
	dummyOnce.Do(func() { dummyHash, _ = HashPassword("not-a-real-password") })

	VerifyPassword(password, dummyHash)
}
