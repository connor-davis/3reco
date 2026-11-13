package profile

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

// UploadAvatar validates the caller's image before replacing its object reference.
func (service *Service) UploadAvatar(ctx context.Context, id string, reader io.Reader, business ...bool) error {
	data, kind, err := storage.Image(reader, 2<<20, true)
	if err != nil {
		return err
	}

	key := "avatars/" + id + "/" + database.NewID()
	if err := service.objects.Put(
		ctx,
		key,
		bytes.NewReader(data),
		int64(len(data)),
		kind,
	); err != nil {
		return err
	}

	if err := service.replaceAvatar(ctx, id, key, business...); err != nil {
		_ = service.objects.Remove(context.WithoutCancel(ctx), key)

		return err
	}

	return nil
}

// DeleteAvatar clears the uploaded image and removes its object after commit.
func (service *Service) DeleteAvatar(ctx context.Context, id string, business ...bool) error {
	return service.replaceAvatar(ctx, id, "", business...)
}

func (service *Service) replaceAvatar(ctx context.Context, id, key string, business ...bool) error {
	return service.db.InTx(ctx, func(ctx context.Context) error {
		old, err := service.store.AvatarKey(ctx, id, true, business...)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("No such profile.")
		}
		if err != nil {
			return err
		}

		if err := service.store.SetAvatar(ctx, id, key, business...); err != nil {
			return err
		}

		if old != "" {
			used, err := service.store.AvatarReferenced(ctx, old)
			if err != nil {
				return err
			}

			if !used {
				service.objects.RemoveAfterCommit(ctx, old)
			}
		}

		return nil
	})
}

// Avatar opens the public image of an active user without exposing its object key.
func (service *Service) Avatar(ctx context.Context, id string, business ...bool) (io.ReadCloser, string, error) {
	key, err := service.store.AvatarKey(ctx, id, false, business...)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && key == "") {
		return nil, "", apperr.NotFound("Avatar not found.")
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

	return &avatarReader{Reader: io.MultiReader(bytes.NewReader(header[:count]), reader), closer: reader},
		http.DetectContentType(header[:count]), nil
}

type avatarReader struct {
	io.Reader
	closer io.Closer
}

func (reader *avatarReader) Close() error { return reader.closer.Close() }
