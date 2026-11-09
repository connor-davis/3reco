package admin

import (
	"context"
	"io"
	"log/slog"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) export(kind string) fiber.Handler {
	return func(c fiber.Ctx) error {
		export, err := h.svc.PrepareExport(
			caller(c),
			kind,
			c.Query("from"),
			c.Query("to"),
			c.Query("itemised"),
			c.Query("type"),
			c.Query("role"),
			c.Query("q"),
		)
		if err != nil {
			return err
		}

		reader, writer := io.Pipe()
		ctx, cancel := context.WithCancel(context.WithoutCancel(c.Context()))
		go func() {
			defer cancel()
			err := export.Write(ctx, writer)
			if err != nil {
				slog.Error("export failed", "kind", kind, "err", err)
			}

			_ = writer.CloseWithError(err)
		}()

		c.Set("Content-Type", "text/csv; charset=utf-8")
		c.Set("Content-Disposition", `attachment; filename="`+export.Filename+`"`)
		c.Set("Cache-Control", "private, no-store")

		return c.SendStream(reader)
	}
}
