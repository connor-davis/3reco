package api

import (
	"io/fs"
	"log/slog"
	"os"
	"path"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/compress"
)

// serveWeb serves the built web app from dist, after every /api route. A file
// that exists is sent as is; any other page path gets index.html so the
// router in the browser can take over. If dist has no index.html the API
// still runs and the gap is logged once.
func serveWeb(app *fiber.App, dist string) {
	root := os.DirFS(dist)

	index, err := fs.ReadFile(root, "index.html")
	if err != nil {
		slog.Warn("web app not served: no index.html", "dist", dist, "err", err)

		return
	}

	app.Use(compress.New())
	app.Use(func(c fiber.Ctx) error {
		if c.Method() != fiber.MethodGet && c.Method() != fiber.MethodHead {
			return c.Next()
		}

		name := strings.TrimPrefix(path.Clean("/"+c.Path()), "/")

		// Files in /assets carry a hash in their name, so they never change.
		if strings.HasPrefix(name, "assets/") {
			body, err := fs.ReadFile(root, name)
			if err != nil {
				return c.Next()
			}

			c.Set(fiber.HeaderCacheControl, "public, max-age=31536000, immutable")
			c.Type(path.Ext(name))

			return c.Send(body)
		}

		// Other files (favicon, manifest) may change, so the browser asks each time.
		c.Set(fiber.HeaderCacheControl, "no-cache")

		// ponytail: reads the whole file per request; fine for a small app, cache
		// the bytes at start if the public/ folder ever grows heavy.
		if body, err := fs.ReadFile(root, name); err == nil && name != "" && name != "index.html" {
			c.Type(path.Ext(name))

			return c.Send(body)
		}

		c.Type("html")

		return c.Send(index)
	})
}
