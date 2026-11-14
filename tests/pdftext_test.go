package tests

import (
	"bytes"
	"compress/zlib"
	"io"
	"regexp"
	"strconv"
	"strings"
	"testing"

	gpdf "github.com/gpdf-dev/gpdf/pdf"
)

var (
	cmapPair  = regexp.MustCompile(`<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,8})>`)
	textToken = regexp.MustCompile(`/(\S+) [0-9.]+ Tf|<([0-9A-Fa-f]*)> Tj`)
)

// pdfText turns a PDF back into the text a reader sees. The invoice font is an
// embedded TrueType font, so the page holds glyph numbers, not letters; each font's
// ToUnicode map turns them back. Every shown line ends with a newline.
//
// Access and privacy tests search this text. Searching raw bytes would pass for a
// leaked account number, because the bytes never hold it as letters.
func pdfText(t *testing.T, data []byte) string {
	t.Helper()

	reader, err := gpdf.NewReader(data)
	if err != nil {
		t.Fatalf("read PDF: %v", err)
	}

	pages, err := reader.PageCount()
	if err != nil {
		t.Fatalf("count pages: %v", err)
	}

	var out strings.Builder
	for index := range pages {
		page, err := reader.PageDict(index)
		must(t, err)
		resources, err := reader.ResolveDict(page["Resources"])
		must(t, err)
		fontDicts, err := reader.ResolveDict(resources["Font"])
		must(t, err)

		maps := map[string]map[string]rune{}
		for name, ref := range fontDicts {
			font, err := reader.ResolveDict(ref)
			must(t, err)
			maps[string(name)] = fontMap(t, reader, font["ToUnicode"])
		}

		contents, err := reader.Resolve(page["Contents"])
		must(t, err)
		parts := []gpdf.Object{contents}
		if list, ok := contents.(gpdf.Array); ok {
			parts = list
		}

		for _, part := range parts {
			stream := streamBytes(t, reader, part)
			current := map[string]rune{}
			for _, match := range textToken.FindAllStringSubmatch(string(stream), -1) {
				if match[1] != "" {
					current = maps[match[1]]

					continue
				}

				for at := 0; at+4 <= len(match[2]); at += 4 {
					out.WriteRune(current[strings.ToUpper(match[2][at:at+4])])
				}
				out.WriteByte('\n')
			}
		}
	}

	if out.Len() == 0 {
		t.Fatal("PDF holds no readable text, so an absence check on it would prove nothing")
	}

	return out.String()
}

// fontMap reads a ToUnicode stream into glyph number (4 hex digits) to rune.
func fontMap(t *testing.T, reader *gpdf.Reader, ref gpdf.Object) map[string]rune {
	t.Helper()

	if ref == nil {
		t.Fatal("PDF font has no ToUnicode map, so its text cannot be read back")
	}

	result := map[string]rune{}
	for _, pair := range cmapPair.FindAllStringSubmatch(string(streamBytes(t, reader, ref)), -1) {
		code, err := strconv.ParseUint(pair[2][:4], 16, 32)
		must(t, err)
		result[strings.ToUpper(pair[1])] = rune(code)
	}

	return result
}

// streamBytes returns a stream's content, inflating it when it is compressed.
func streamBytes(t *testing.T, reader *gpdf.Reader, ref gpdf.Object) []byte {
	t.Helper()

	object, err := reader.Resolve(ref)
	must(t, err)
	stream, ok := object.(gpdf.Stream)
	if !ok {
		t.Fatalf("expected a PDF stream, got %T", object)
	}

	if _, compressed := stream.Dict["Filter"]; !compressed {
		return stream.Content
	}

	inflate, err := zlib.NewReader(bytes.NewReader(stream.Content))
	must(t, err)
	data, err := io.ReadAll(inflate)
	must(t, err)

	return data
}

func must(t *testing.T, err error) {
	t.Helper()

	if err != nil {
		t.Fatal(err)
	}
}

// pdfHas reports whether the PDF shows the text. It never searches raw bytes.
func pdfHas(t *testing.T, data []byte, want string) bool {
	t.Helper()

	return strings.Contains(pdfText(t, data), want)
}

// pdfPages counts the pages of a PDF.
func pdfPages(t *testing.T, data []byte) int {
	t.Helper()

	reader, err := gpdf.NewReader(data)
	must(t, err)
	pages, err := reader.PageCount()
	must(t, err)

	return pages
}
