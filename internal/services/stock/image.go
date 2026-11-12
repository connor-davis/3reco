package stock

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
)

// UploadImage checks ownership before validating and storing one stock photo.
func (service *Service) UploadImage(ctx context.Context, id, owner string, reader io.Reader) error {
	item, err := service.store.Find(ctx, id, false)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != owner) {
		return apperr.NotFound("No such stock.")
	}
	if err != nil {
		return err
	}

	data, kind, err := storage.Image(reader, 2<<20, true)
	if err != nil {
		return err
	}

	key := "stock/" + id + "/" + database.NewID()
	if err := service.objects.Put(
		ctx,
		key,
		bytes.NewReader(data),
		int64(len(data)),
		kind,
	); err != nil {
		return err
	}

	if err := service.replaceImage(ctx, id, owner, key); err != nil {
		_ = service.objects.Remove(context.WithoutCancel(ctx), key)

		return err
	}

	return nil
}

// DeleteImage clears a photo, removing its object only after commit.
func (service *Service) DeleteImage(ctx context.Context, id, owner string) error {
	return service.replaceImage(ctx, id, owner, "")
}

func (service *Service) replaceImage(ctx context.Context, id, owner, key string) error {
	return service.db.InTx(ctx, func(ctx context.Context) error {
		item, err := service.store.Find(ctx, id, true)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != owner) {
			return apperr.NotFound("No such stock.")
		}
		if err != nil {
			return err
		}

		if err := service.store.SetImage(ctx, id, owner, key); err != nil {
			return err
		}

		if item.ImageKey != "" {
			service.objects.RemoveAfterCommit(ctx, item.ImageKey)
		}

		return nil
	})
}

// Image rechecks current lot visibility before opening its photo.
func (service *Service) Image(ctx context.Context, id, caller string) (io.ReadCloser, string, error) {
	key, err := service.store.ImageKey(ctx, id, caller)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", apperr.NotFound("Photo not found.")
	}
	if err != nil {
		return nil, "", err
	}

	reader, err := service.objects.Get(ctx, key)
	if err != nil {
		return nil, "", err
	}

	header := make([]byte, 512)
	count, err := reader.Read(header)
	if err != nil && err != io.EOF {
		_ = reader.Close()

		return nil, "", err
	}

	return &imageReader{Reader: io.MultiReader(bytes.NewReader(header[:count]), reader), closer: reader},
		http.DetectContentType(header[:count]), nil
}

type imageReader struct {
	io.Reader
	closer io.Closer
}

func (reader *imageReader) Close() error { return reader.closer.Close() }
