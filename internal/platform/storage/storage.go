// Package storage keeps uploaded files in MinIO (locally) or any S3 service.
package storage

import (
	"context"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
)

// Client is the one S3 connection the server uses.
type Client struct {
	mc     *minio.Client
	bucket string
}

// New builds the client. It does not connect: call EnsureBucket at start.
func New(cfg config.Config) (*Client, error) {
	mc, err := minio.New(cfg.S3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: cfg.S3UseTLS,
		Region: cfg.S3Region,
	})
	if err != nil {
		return nil, err
	}

	return &Client{mc: mc, bucket: cfg.S3Bucket}, nil
}

// EnsureBucket creates the bucket when it is missing.
func (c *Client) EnsureBucket(ctx context.Context) error {
	exists, err := c.mc.BucketExists(ctx, c.bucket)
	if err != nil || exists {
		return err
	}

	return c.mc.MakeBucket(ctx, c.bucket, minio.MakeBucketOptions{})
}

// Put stores size bytes under key.
func (c *Client) Put(
	ctx context.Context,
	key string,
	body io.Reader,
	size int64,
	contentType string,
) error {
	_, err := c.mc.PutObject(ctx, c.bucket, key, body, size, minio.PutObjectOptions{
		ContentType: contentType,
	})

	return err
}

// Get opens the object. The caller closes it.
func (c *Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	object, err := c.mc.GetObject(ctx, c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}

	// MinIO opens lazily. Check before HTTP headers promise a successful file.
	if _, err := object.Stat(); err != nil {
		_ = object.Close()

		return nil, err
	}

	return object, nil
}

// Remove deletes the object. A missing object is not an error.
func (c *Client) Remove(ctx context.Context, key string) error {
	return c.mc.RemoveObject(ctx, c.bucket, key, minio.RemoveObjectOptions{})
}

// RemoveAfterCommit deletes the object only once the transaction in ctx
// commits, so a rolled-back change keeps its file.
func (c *Client) RemoveAfterCommit(ctx context.Context, key string) {
	database.AfterCommit(ctx, func() {
		_ = c.Remove(context.WithoutCancel(ctx), key)
	})
}

var unsafeName = regexp.MustCompile(`[^a-z0-9_.-]+`)

// SafeName makes a file name safe to show and to put in a header: lowercase,
// letters, digits, dot, dash and underscore only. Never use the user's name as
// the object key; use NewID plus this as the extension holder.
func SafeName(original string) string {
	name := unsafeName.ReplaceAllString(strings.ToLower(original), "_")
	name = strings.Trim(name, "._")

	if name == "" {
		return "file"
	}

	return name
}

// PresignGet returns a short-lived download link for the object.
func (c *Client) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, key, ttl, nil)
	if err != nil {
		return "", err
	}

	return u.String(), nil
}
