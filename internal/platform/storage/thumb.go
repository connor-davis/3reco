package storage

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png" // registers the PNG decoder for image.Decode

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // registers the WEBP decoder; Go's standard library has none

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// maxThumbPixels stops a tiny file that unpacks into a huge picture (a
// "decompression bomb") from eating the server's memory.
const maxThumbPixels = 40_000_000

// Thumbnail shrinks a PNG, JPEG or WEBP so its long edge is at most maxEdge and
// returns it as JPEG. A picture that is already small keeps its size. Anything
// that cannot be decoded is a 400, so a bad file never ends up stored.
func Thumbnail(data []byte, maxEdge int) ([]byte, error) {
	failed := apperr.BadRequest("Could not make a small copy of this image. Try another one.", nil)

	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 ||
		config.Width*config.Height > maxThumbPixels {
		return nil, failed
	}

	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, failed
	}

	width, height := config.Width, config.Height
	if longest := max(width, height); longest > maxEdge {
		width = max(width*maxEdge/longest, 1)
		height = max(height*maxEdge/longest, 1)
	}

	// JPEG has no see-through pixels, so paint white first; a transparent PNG
	// would otherwise turn black.
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(target, target.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(target, target.Bounds(), source, source.Bounds(), draw.Over, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, target, &jpeg.Options{Quality: 80}); err != nil {
		return nil, failed
	}

	return out.Bytes(), nil
}
