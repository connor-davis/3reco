package tests

import (
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/services/auth"
)

// Hashes made by Better Auth's own hashPassword (better-auth/dist/crypto),
// run with node. The second password has a ligature that NFKC folds to "fi".
var legacyVectors = []struct{ password, hash string }{
	{
		"correct horse battery",
		"4870f519962e02880a6005b38459698c:40537ea1d50720bdbc3fc4dac54a7b82a9ec7714750eddc19aaf1ceac85496147ccf9e88205fb0f5386e1e28676aea5d506c358590e36d3fe3838175fa1e1bbb",
	},
	{
		"pässwörd-ﬁ-✓",
		"bf1722fa9fc63279cea5a71d7136358e:98fd25053f72252e98f4a3704e106448076663cc8df7c6749fa029fc90c0b782cd1a09dbd609aff8918ba03f13a3060a57f4606626da22dd28066e1266e7080e",
	},
}

func TestLegacyScryptVectors(t *testing.T) {
	for _, v := range legacyVectors {
		ok, legacy := auth.VerifyPassword(v.password, v.hash)
		if !ok || !legacy {
			t.Errorf("%q: ok=%v legacy=%v, want both true", v.password, ok, legacy)
		}

		if ok, _ := auth.VerifyPassword(v.password+"x", v.hash); ok {
			t.Errorf("%q: a wrong password was accepted", v.password)
		}
	}
}

func TestArgon2idRoundTrip(t *testing.T) {
	hash, err := auth.HashPassword("a long enough password")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("not argon2id: %s", hash)
	}

	if ok, legacy := auth.VerifyPassword("a long enough password", hash); !ok || legacy {
		t.Errorf("ok=%v legacy=%v, want true and false", ok, legacy)
	}

	if ok, _ := auth.VerifyPassword("another password", hash); ok {
		t.Error("a wrong password was accepted")
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	for _, hash := range []string{
		"", ":", "abc", "zz:zz", "$argon2id$", "$argon2id$v=19$m=999999999,t=1,p=1$AAAA$AAAA",
	} {
		if ok, _ := auth.VerifyPassword("x", hash); ok {
			t.Errorf("hash %q was accepted", hash)
		}
	}
}
