package testutil

import (
	"context"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/connor-davis/3reco/internal/platform/config"
	"github.com/connor-davis/3reco/internal/platform/database"
	"github.com/connor-davis/3reco/internal/platform/storage"
)

func testStorage(t testing.TB, cfg *config.Config) *storage.Client {
	t.Helper()
	cfg.S3Bucket = "threereco-test-" + database.NewID()
	objects, err := storage.New(*cfg)
	if err != nil {
		t.Fatalf("storage config: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := objects.EnsureBucket(ctx); err != nil {
		skipOrFail(t, "MinIO is not reachable (run `task up`): %v", err)
	}

	client, err := minio.New(cfg.S3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: cfg.S3UseTLS, Region: cfg.S3Region,
	})
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		for object := range client.ListObjects(ctx, cfg.S3Bucket, minio.ListObjectsOptions{Recursive: true}) {
			if object.Err != nil {
				t.Errorf("list test objects: %v", object.Err)

				break
			}

			if err := objects.Remove(ctx, object.Key); err != nil {
				t.Errorf("remove test object: %v", err)
			}
		}

		if err := client.RemoveBucket(ctx, cfg.S3Bucket); err != nil {
			t.Errorf("remove test bucket: %v", err)
		}
	})

	return objects
}
