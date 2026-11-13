package tests

import (
	"errors"
	"strings"
	"testing"

	"github.com/connor-davis/3reco/internal/platform/crypt"
	"github.com/connor-davis/3reco/tests/testutil"
)

func TestFieldCryptRoundTrip(t *testing.T) {
	cipher := testutil.Cipher(t)

	sealed, err := cipher.Encrypt("62001234567")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(sealed, "v1:") || strings.Contains(sealed, "62001234567") {
		t.Errorf("sealed value %q has no prefix or leaks the plain text", sealed)
	}

	again, _ := cipher.Encrypt("62001234567")
	if again == sealed {
		t.Error("two encryptions gave the same text: the nonce is not random")
	}

	plain, err := cipher.Decrypt(sealed)
	if err != nil || plain != "62001234567" {
		t.Errorf("decrypt = %q, %v", plain, err)
	}

	// Empty stays empty both ways.
	if empty, err := cipher.Encrypt(""); err != nil || empty != "" {
		t.Errorf("encrypt empty = %q, %v", empty, err)
	}

	if empty, err := cipher.Decrypt(""); err != nil || empty != "" {
		t.Errorf("decrypt empty = %q, %v", empty, err)
	}
}

func TestFieldCryptRefusesBadInput(t *testing.T) {
	cipher := testutil.Cipher(t)

	if _, err := cipher.Decrypt("62001234567"); !errors.Is(err, crypt.ErrNotEncrypted) {
		t.Errorf("a value without the prefix: %v, want ErrNotEncrypted", err)
	}

	sealed, _ := cipher.Encrypt("secret")
	if _, err := cipher.Decrypt(sealed[:len(sealed)-2] + "AA"); err == nil {
		t.Error("a changed value was accepted")
	}

	other, err := crypt.New("MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := other.Decrypt(sealed); err == nil {
		t.Error("a value sealed with another key was accepted")
	}

	for _, key := range []string{"", "not base64!", "c2hvcnQ="} {
		if _, err := crypt.New(key); err == nil {
			t.Errorf("key %q was accepted", key)
		}
	}
}

func TestFieldCryptMask(t *testing.T) {
	for plain, want := range map[string]string{
		"": "", "1": "••••", "1234": "••••", "62001234567": "•••• 4567",
	} {
		if got := crypt.Mask(plain); got != want {
			t.Errorf("Mask(%q) = %q, want %q", plain, got, want)
		}
	}
}
