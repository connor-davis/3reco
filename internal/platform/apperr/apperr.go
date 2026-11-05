// Package apperr holds the errors a user can cause. The API turns each one
// into a 4xx JSON answer; any other error is a bug and becomes a plain 500.
package apperr

import "net/http"

// Error is an expected, user-facing failure.
type Error struct {
	Status  int               // HTTP status code
	Code    string            // short machine word, such as "invalid"
	Message string            // sentence shown on screen
	Data    map[string]string // optional per-field messages, keyed by field name
}

// Error returns the message, so *Error satisfies the error interface.
func (e *Error) Error() string { return e.Message }

// BadRequest is for invalid input. fields may be nil.
func BadRequest(message string, fields map[string]string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "invalid", Message: message, Data: fields}
}

// Field is a BadRequest about one field.
func Field(field, message string) *Error {
	return BadRequest("Please fix the highlighted field.", map[string]string{field: message})
}

// Unauthorized means "sign in first" (or the session is bad).
func Unauthorized(message string) *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: message}
}

// Forbidden means "you are signed in, but not allowed to do this".
func Forbidden(message string) *Error {
	return &Error{Status: http.StatusForbidden, Code: "forbidden", Message: message}
}

// NotFound means the thing doesn't exist, or you aren't allowed to see it.
func NotFound(message string) *Error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: message}
}

// Conflict means the change clashes with what is already stored.
func Conflict(message string) *Error {
	return &Error{Status: http.StatusConflict, Code: "conflict", Message: message}
}

// TooMany means the caller hit a rate limit.
func TooMany(message string) *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: message}
}

// WithCode returns a copy of the error with a different machine code, so the
// web app can react to one case (for example "email_not_verified").
func (e *Error) WithCode(code string) *Error {
	copied := *e
	copied.Code = code

	return &copied
}
