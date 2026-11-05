package importer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"

	"github.com/connor-davis/3reco/internal/platform/storage"
)

const (
	maxReceiptBytes = 5 << 20
	maxInvoiceBytes = 10 << 20
	maxReceipts     = 5
)

// blob is one file to put in MinIO. A small one (an avatar) carries its bytes;
// a receipt or invoice is read from the export again at upload time, so the
// planner never holds every file in memory.
type blob struct {
	key         string
	contentType string
	data        []byte
	storageID   string
	limit       int64
}

// upload puts every blob in MinIO. It returns the keys it wrote, also when it
// fails half way, so the caller can remove them.
func (p *planner) upload(ctx context.Context, objects *storage.Client) ([]string, error) {
	var written []string

	for _, item := range p.blobs {
		data := item.data

		if data == nil {
			var found bool
			var err error

			data, found, err = p.a.readBlob(item.storageID, item.limit)
			if err != nil {
				return written, fmt.Errorf("read %s from the export: %w", item.storageID, err)
			}

			if !found {
				return written, fmt.Errorf("file %s is not in the export", item.storageID)
			}
		}

		err := objects.Put(ctx, item.key, bytes.NewReader(data), int64(len(data)), item.contentType)
		if err != nil {
			return written, fmt.Errorf("put %s: %w", item.key, err)
		}

		written = append(written, item.key)
	}

	return written, nil
}

// removeObjects deletes the files of an import that did not commit. A fresh
// context: the one that failed may be cancelled.
func removeObjects(ctx context.Context, objects *storage.Client, keys []string) {
	for _, key := range keys {
		_ = objects.Remove(context.WithoutCancel(ctx), key)
	}
}

// checksum is the hex sha256 the receipts table stores.
func checksum(data []byte) string {
	sum := sha256.Sum256(data)

	return hex.EncodeToString(sum[:])
}

// storageDiffers says whether the export's own record of a stored file (its
// _storage document) disagrees with the bytes we read. A missing record is not
// a difference.
// ponytail: the key names sha256 and size, and whether sha256 is hex or
// base64, are unchecked against a real export. It accepts either encoding.
func (p *planner) storageDiffers(storageID string, data []byte) bool {
	meta := p.storage[storageID]
	if meta == nil {
		return false
	}

	sum := sha256.Sum256(data)
	hexSum, base64Sum := hex.EncodeToString(sum[:]), base64.StdEncoding.EncodeToString(sum[:])

	if exported := str(meta["sha256"]); exported != "" && exported != hexSum && exported != base64Sum {
		return true
	}

	size, _ := exactNumber(meta["size"], false)

	return size != "" && size != fmt.Sprint(len(data))
}
