// Package crypt encrypts the few identifiers 3REco must keep secret at rest
// (ID numbers, account numbers, ewallet ids) with AES-256-GCM.
package crypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/connor-davis/3reco/internal/platform/config"
)

// prefix names the key a value was sealed with, so a later key can be added
// beside "v1" without re-reading old rows.
const prefix = "v1:"

// ErrNotEncrypted means a stored value has no key-version prefix. Reading it
// fails instead of returning text that may be a plain identifier.
var ErrNotEncrypted = errors.New("stored value is not encrypted")

// Cipher seals and opens field values.
type Cipher struct{ aead cipher.AEAD }

// FromConfig is the fx constructor. It stops the server from starting
// without a valid key.
func FromConfig(cfg config.Config) (*Cipher, error) { return New(cfg.FieldKey) }

// New builds a cipher from a base64 string that decodes to 32 bytes.
func New(key string) (*Cipher, error) {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(key))
	if err != nil || len(raw) != 32 {
		return nil, fmt.Errorf("THREERECO_FIELD_KEY must be 32 random bytes, base64 encoded")
	}

	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}

	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	return &Cipher{aead: aead}, nil
}

// Encrypt seals a value. An empty value stays empty.
func (c *Cipher) Encrypt(plain string) (string, error) {
	if plain == "" {
		return "", nil
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	sealed := c.aead.Seal(nonce, nonce, []byte(plain), nil)

	return prefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt opens a stored value. An empty value stays empty; a value without
// the prefix is refused.
func (c *Cipher) Decrypt(stored string) (string, error) {
	if stored == "" {
		return "", nil
	}

	body, found := strings.CutPrefix(stored, prefix)
	if !found {
		return "", ErrNotEncrypted
	}

	raw, err := base64.StdEncoding.DecodeString(body)
	if err != nil || len(raw) < c.aead.NonceSize() {
		return "", errors.New("stored value is damaged")
	}

	nonce, sealed := raw[:c.aead.NonceSize()], raw[c.aead.NonceSize():]

	plain, err := c.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", errors.New("stored value cannot be opened with this key")
	}

	return string(plain), nil
}

// Mask hides all but the last four characters: ******1234.
func Mask(plain string) string {
	if plain == "" {
		return ""
	}

	runes := []rune(plain)
	if len(runes) <= 4 {
		return "******"
	}

	return "******" + string(runes[len(runes)-4:])
}
