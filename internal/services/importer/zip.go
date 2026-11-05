package importer

import (
	"archive/zip"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"path"
	"strconv"
	"strings"
)

// maxDocumentsFile caps one documents.jsonl, so a bad export cannot fill memory.
const maxDocumentsFile = 64 << 20

// doc is one Convex document. Numbers inside are json.Number text, never float64.
type doc map[string]any

// archive is an opened `npx convex export` ZIP.
type archive struct {
	reader *zip.ReadCloser
	files  map[string]*zip.File
	blobs  map[string]*zip.File
}

// openArchive opens the ZIP and refuses unsafe entry names.
func openArchive(zipPath string) (*archive, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("open export: %w", err)
	}

	a := &archive{reader: reader, files: map[string]*zip.File{}, blobs: map[string]*zip.File{}}

	for _, file := range reader.File {
		name := file.Name

		if strings.Contains(name, "..") || strings.HasPrefix(name, "/") || strings.Contains(name, `\`) {
			_ = reader.Close()

			return nil, fmt.Errorf("export entry %q has an unsafe name", name)
		}

		if file.FileInfo().IsDir() {
			continue
		}

		a.files[name] = file

		// ponytail: a real export must confirm blobs sit at _storage/<storageId>.
		// A file extension after the id is tolerated.
		parts := strings.Split(name, "/")
		if len(parts) == 2 && parts[0] == "_storage" && parts[1] != "documents.jsonl" {
			a.blobs[parts[1]] = file
			a.blobs[strings.TrimSuffix(parts[1], path.Ext(parts[1]))] = file
		}
	}

	return a, nil
}

// Close closes the ZIP.
func (a *archive) Close() error { return a.reader.Close() }

// findTable is the one place that knows where a table's documents.jsonl sits.
// ponytail: this layout is the documented one and is unchecked against a real
// export. It looks for <table>/documents.jsonl, then for
// _components/<component>/<table>/documents.jsonl (where Better Auth tables
// are expected). It never guesses beyond that: no match is an error.
func (a *archive) findTable(table string) (*zip.File, error) {
	if file, ok := a.files[table+"/documents.jsonl"]; ok {
		return file, nil
	}

	var found []*zip.File

	for name, file := range a.files {
		parts := strings.Split(name, "/")

		if len(parts) == 4 && parts[0] == "_components" && parts[2] == table &&
			parts[3] == "documents.jsonl" {
			found = append(found, file)
		}
	}

	switch len(found) {
	case 0:
		return nil, fmt.Errorf(
			"table %q not found: looked for %s/documents.jsonl and _components/*/%s/documents.jsonl",
			table, table, table,
		)
	case 1:
		return found[0], nil
	}

	return nil, fmt.Errorf("table %q is in more than one component folder", table)
}

// documents reads every document of a table.
func (a *archive) documents(table string) ([]doc, error) {
	file, err := a.findTable(table)
	if err != nil {
		return nil, err
	}

	if file.UncompressedSize64 > maxDocumentsFile {
		return nil, fmt.Errorf("%s is larger than %d MiB", file.Name, maxDocumentsFile>>20)
	}

	body, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer body.Close()

	decoder := json.NewDecoder(io.LimitReader(body, maxDocumentsFile))
	decoder.UseNumber()

	var docs []doc

	for {
		var raw map[string]any

		err := decoder.Decode(&raw)
		if errors.Is(err, io.EOF) {
			return docs, nil
		}

		if err != nil {
			return nil, fmt.Errorf("%s: line %d: %w", file.Name, len(docs)+1, err)
		}

		value, err := normalize(raw)
		if err != nil {
			return nil, fmt.Errorf("%s: line %d: %w", file.Name, len(docs)+1, err)
		}

		object, ok := value.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s: line %d is not a document", file.Name, len(docs)+1)
		}

		docs = append(docs, doc(object))
	}
}

// normalize turns Convex's tagged values into plain ones: {"$integer"} and
// {"$float"} become json.Number text. Anything else tagged is refused.
func normalize(value any) (any, error) {
	switch v := value.(type) {
	case map[string]any:
		if len(v) == 1 {
			for key, inner := range v {
				if strings.HasPrefix(key, "$") {
					return decodeTagged(key, inner)
				}
			}
		}

		for key, inner := range v {
			out, err := normalize(inner)
			if err != nil {
				return nil, err
			}

			v[key] = out
		}

		return v, nil
	case []any:
		for i, inner := range v {
			out, err := normalize(inner)
			if err != nil {
				return nil, err
			}

			v[i] = out
		}

		return v, nil
	}

	return value, nil
}

func decodeTagged(tag string, inner any) (any, error) {
	text, _ := inner.(string)

	raw, err := base64.StdEncoding.DecodeString(text)
	if err != nil || len(raw) != 8 {
		return nil, fmt.Errorf("bad %s value", tag)
	}

	bits := binary.LittleEndian.Uint64(raw)

	switch tag {
	case "$integer":
		return json.Number(strconv.FormatInt(int64(bits), 10)), nil
	case "$float":
		f := math.Float64frombits(bits)
		if math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, errors.New("NaN and Infinity cannot be stored as numbers")
		}

		return json.Number(strconv.FormatFloat(f, 'f', -1, 64)), nil
	}

	return nil, fmt.Errorf("unsupported Convex value %s", tag)
}

// readBlob reads a stored file by its storage id. found is false when the
// ZIP has no such file. It reads at most limit+1 bytes, so the caller can
// tell "too big" from "fits".
func (a *archive) readBlob(storageID string, limit int64) (data []byte, found bool, err error) {
	file, ok := a.blobs[storageID]
	if !ok {
		return nil, false, nil
	}

	body, err := file.Open()
	if err != nil {
		return nil, true, err
	}
	defer body.Close()

	data, err = io.ReadAll(io.LimitReader(body, limit+1))

	return data, true, err
}
