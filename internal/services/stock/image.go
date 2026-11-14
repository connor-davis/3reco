package stock

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5"

	"github.com/connor-davis/3reco/internal/platform/apperr"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
	store "github.com/connor-davis/3reco/internal/stores/stock"
)

// AddPhoto checks ownership before validating and storing one more stock photo.
func (service *Service) AddPhoto(ctx context.Context, id, owner string, reader io.Reader) error {
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

	photoID := database.NewID()
	key := "stock/" + id + "/" + photoID
	if err := service.objects.Put(
		ctx,
		key,
		bytes.NewReader(data),
		int64(len(data)),
		kind,
	); err != nil {
		return err
	}

	err = service.changePhotos(ctx, id, owner, func(ctx context.Context, ids []string) error {
		if len(ids) >= store.MaxPhotos {
			return apperr.Conflict("A stock item can have up to 8 photos. Remove one first.")
		}

		return service.store.AddPhoto(ctx, id, photoID, key)
	})
	if err != nil {
		_ = service.objects.Remove(context.WithoutCancel(ctx), key)

		return err
	}

	return nil
}

// DeletePhoto removes one photo, deleting its file only after commit.
func (service *Service) DeletePhoto(ctx context.Context, id, photoID, owner string) error {
	return service.changePhotos(ctx, id, owner, func(ctx context.Context, _ []string) error {
		key, err := service.store.DeletePhoto(ctx, id, photoID)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("No such photo.")
		}
		if err != nil {
			return err
		}

		service.objects.RemoveAfterCommit(ctx, key)

		return nil
	})
}

// ReorderPhotos sets the photo order; ids must be exactly the current photos.
func (service *Service) ReorderPhotos(ctx context.Context, id, owner string, ids []string) error {
	return service.changePhotos(ctx, id, owner, func(ctx context.Context, current []string) error {
		// A repeated or missing id makes the sorted lists differ.
		if !slices.Equal(slices.Sorted(slices.Values(ids)), slices.Sorted(slices.Values(current))) {
			return apperr.BadRequest("Send every photo of this item once.", nil)
		}

		return service.store.OrderPhotos(ctx, id, ids)
	})
}

// changePhotos runs change under the stock row lock, so two changes at once
// cannot both see room for a photo. A caller who does not own the row gets 404.
func (service *Service) changePhotos(
	ctx context.Context,
	id, owner string,
	change func(ctx context.Context, ids []string) error,
) error {
	return service.db.InTx(ctx, func(ctx context.Context) error {
		item, err := service.store.Find(ctx, id, true)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && item.OwnerID != owner) {
			return apperr.NotFound("No such stock.")
		}
		if err != nil {
			return err
		}

		ids, err := service.store.PhotoIDs(ctx, id)
		if err != nil {
			return err
		}

		return change(ctx, ids)
	})
}

// Photo rechecks current lot visibility before opening a photo; photoID ""
// opens the cover. Staff may open any photo.
func (service *Service) Photo(
	ctx context.Context,
	id, photoID, caller string,
	staff bool,
) (io.ReadCloser, string, error) {
	key, err := service.store.PhotoKey(ctx, id, photoID, caller, staff)
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
