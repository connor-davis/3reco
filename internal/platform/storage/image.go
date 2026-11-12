package storage

import (
	"io"
	"net/http"

	"github.com/connor-davis/3reco/internal/platform/apperr"
)

// Image reads at most limit+1 bytes and detects the actual file type.
func Image(reader io.Reader, limit int64, webp bool) ([]byte, string, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, "", apperr.BadRequest("Could not read the image.", nil)
	}

	if len(data) == 0 || int64(len(data)) > limit {
		return nil, "", apperr.BadRequest("The image must be nonempty and within the size limit.", nil)
	}

	kind := http.DetectContentType(data)
	if kind != "image/png" && kind != "image/jpeg" && !(webp && kind == "image/webp") {
		message := "Choose a PNG or JPEG image."
		if webp {
			message = "Choose a PNG, JPEG or WEBP image."
		}

		return nil, "", apperr.BadRequest(message, nil)
	}

	return data, kind, nil
}
