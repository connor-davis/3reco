# Code style

Short rules for Go and TypeScript in 3REco. Write for a junior developer who
opens the file for the first time. `task check` tests the rules a tool can
see; review checks the rest.

## Spacing

- Put a blank line between steps: read, check, change, save, answer.
- In a function over 10 lines, no run of more than 6 lines goes without a
  blank line or a comment.

## Calls and line length

- Go: put a call on one line if it fits in 100 characters. If it doesn't,
  put one argument per line. Don't reformat old code just for this.
- TypeScript: Prettier decides line breaks (80 characters), using the root
  `prettier.config.js`. Run it on every file you touch. One statement per
  line, one JSX element per line once it wraps.
- Never squeeze code onto one line to stay under the 900-line limit. Split
  the file by job instead.

```go
// Good: fits on one line.
if err := json.Unmarshal(body, &in); err != nil {
	return err
}
```

## Comments

- Say why, in plain words. The code already says what.
- Every exported Go name gets a doc comment that starts with its name.
  An unexported helper whose name explains itself needs none.
- A decision id (`D-003`) may follow the why as a pointer. It never stands
  in for it: `// Sellers can't buy their own stock (D-003).` is fine;
  `// D-003` is not.
- A deliberate corner cut gets a `ponytail:` comment that names the limit
  and the way up.

## Names

- Whole words that say what a thing holds or does: `reserveStock`, not `rs`.
- One-letter names only for `i`, `t`, `c`, plus `ctx`, `err` and `db`.

## Files

- No file over 900 lines, Go or TypeScript. Generated files don't count.
- Split by job (`requests_accept.go`, `requests_cancel.go`), not by letter
  or size.

## Errors

- Anything a user can cause returns an `apperr` error, so it is a 4xx with
  a clear message. Plain `errors.New` is for bugs.
- Never send a raw database error to the browser.

## Web app

- Reuse the shared components and the owners listed in
  [code-map.md](code-map.md) before making a new piece.
- Pages are TanStack Router file routes in `src/routes/` (the router plugin
  builds `routeTree.gen.ts`). No `pages/` folder. A page's own pieces sit
  next to it in a `-components/` folder, which the router skips.
- Plain words on screen. If a non-coder wouldn't know the word, use another.
- Every page has a loading, empty and error state, and works in light and
  dark.

## Say no to

- An abstraction with one caller.
- A dependency for something a few lines can do.
- A helper file for one helper.

## What `task check` tests

| Rule | Tool |
|---|---|
| Go format | `gofmt` in `task vet` |
| Go mistakes and dead code | `go vet` and `staticcheck` in `task vet` |
| Doc comments, file size | `tests/style_test.go` |
| TypeScript types | `tsc -b` in `task lint:web` |
| TypeScript lint | ESLint in `task lint:web` |
