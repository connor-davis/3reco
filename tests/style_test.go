package tests

import (
	"bufio"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const maxLines = 900

// tooLongForNow are web app files that were already over the limit when the
// check was added. ponytail: remove each line when its file is split; the web
// app is rewired in a later task, so it is not touched here.
var tooLongForNow = map[string]bool{
	"web/apps/app/src/components/dialogs/collections/create.tsx": true,
	"web/apps/app/src/components/guards/authentication.tsx":      true,
	"web/apps/app/src/routes/profile/index.tsx":                  true,
}

// repoFiles lists the files git knows about or would add (so a new file is
// checked before it is committed). It never walks the folder: mystuff/ and
// node_modules hold files that are not ours.
func repoFiles(t *testing.T) (root string, files []string) {
	t.Helper()

	top, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Skipf("not a git checkout: %v", err)
	}

	root = strings.TrimSpace(string(top))

	cmd := exec.Command("git", "ls-files", "--cached", "--others", "--exclude-standard")
	cmd.Dir = root

	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git ls-files: %v", err)
	}

	for _, name := range strings.Split(string(out), "\n") {
		name = strings.TrimSpace(name)

		// reference/ is the first 3REco, read only. Generated files are not ours to split.
		if name == "" || strings.HasPrefix(name, "reference/") || strings.HasPrefix(name, "mystuff/") ||
			strings.Contains(name, "node_modules/") || strings.Contains(name, "_generated/") ||
			strings.Contains(name, ".gen.") || strings.HasSuffix(name, ".d.ts") {
			continue
		}

		files = append(files, name)
	}

	return root, files
}

// TestNoFileOverLimit keeps every Go and TypeScript file under 900 lines.
func TestNoFileOverLimit(t *testing.T) {
	root, files := repoFiles(t)

	for _, name := range files {
		switch filepath.Ext(name) {
		case ".go", ".ts", ".tsx":
		default:
			continue
		}

		f, err := os.Open(filepath.Join(root, name))
		if err != nil {
			continue // listed but deleted in the working tree
		}

		lines := 0
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1<<20), 1<<20)

		for sc.Scan() {
			lines++
		}

		f.Close()

		if lines > maxLines && !tooLongForNow[name] {
			t.Errorf("%s has %d lines (limit %d)", name, lines, maxLines)
		}
	}
}

// TestExportedNamesHaveDocComments makes sure every exported Go name in the
// product code has a doc comment.
func TestExportedNamesHaveDocComments(t *testing.T) {
	root, files := repoFiles(t)
	fset := token.NewFileSet()

	for _, name := range files {
		if filepath.Ext(name) != ".go" || strings.HasSuffix(name, "_test.go") {
			continue
		}

		if !strings.HasPrefix(name, "cmd/") && !strings.HasPrefix(name, "internal/") &&
			!strings.HasPrefix(name, "tests/testutil/") {
			continue
		}

		file, err := parser.ParseFile(fset, filepath.Join(root, name), nil, parser.ParseComments)
		if err != nil {
			t.Errorf("%s: %v", name, err)

			continue
		}

		for _, decl := range file.Decls {
			checkDecl(t, fset, decl)
		}
	}
}

func checkDecl(t *testing.T, fset *token.FileSet, decl ast.Decl) {
	t.Helper()

	missing := func(pos token.Pos, what string) {
		t.Errorf("%s: exported %s has no doc comment", fset.Position(pos), what)
	}

	switch d := decl.(type) {
	case *ast.FuncDecl:
		if d.Name.IsExported() && d.Doc == nil && exportedReceiver(d) {
			missing(d.Pos(), d.Name.Name)
		}

	case *ast.GenDecl:
		for _, spec := range d.Specs {
			switch s := spec.(type) {
			case *ast.TypeSpec:
				if s.Name.IsExported() && d.Doc == nil && s.Doc == nil {
					missing(s.Pos(), s.Name.Name)
				}
			case *ast.ValueSpec:
				for _, n := range s.Names {
					if n.IsExported() && d.Doc == nil && s.Doc == nil && s.Comment == nil {
						missing(n.Pos(), n.Name)
					}
				}
			}
		}
	}
}

// exportedReceiver is true for plain functions and for methods of exported types.
func exportedReceiver(d *ast.FuncDecl) bool {
	if d.Recv == nil || len(d.Recv.List) == 0 {
		return true
	}

	expr := d.Recv.List[0].Type
	if star, ok := expr.(*ast.StarExpr); ok {
		expr = star.X
	}

	id, ok := expr.(*ast.Ident)

	return ok && id.IsExported()
}
