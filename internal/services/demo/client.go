package demo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"time"
)

// client is one signed-in (or signed-out) browser talking to the server the
// seed started on this machine. It keeps cookies and sends the Origin the
// CSRF check wants, so every step runs the real routes and rules.
type client struct {
	http   *http.Client
	base   string
	origin string
}

func newClient(base, origin string) *client {
	jar, _ := cookiejar.New(nil)

	return &client{
		http:   &http.Client{Jar: jar, Timeout: 30 * time.Second},
		base:   base,
		origin: origin,
	}
}

// call sends one JSON request and decodes the JSON answer into out (when not
// nil). Any status outside 2xx is an error that shows the route and the reply.
func (c *client) call(method, path string, body, out any) error {
	var reader io.Reader

	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}

		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		return err
	}

	req.Header.Set("Origin", c.origin)

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)

	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("%s %s answered %d: %s", method, path, resp.StatusCode, raw)
	}

	if out == nil {
		return nil
	}

	return json.Unmarshal(raw, out)
}

// created reads the id out of a create answer.
func (c *client) created(method, path string, body any) (string, error) {
	var out struct {
		ID string `json:"id"`
	}

	if err := c.call(method, path, body, &out); err != nil {
		return "", err
	}

	if out.ID == "" {
		return "", fmt.Errorf("%s %s answered with no id", method, path)
	}

	return out.ID, nil
}
