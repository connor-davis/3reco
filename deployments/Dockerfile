# syntax=docker/dockerfile:1
#
# 3REco as one small image: the Go binary plus the built web app, on
# distroless, run as non-root. The binary serves the web app next to /api.
# Build from the repo root:
#
#   podman build -f deployments/Dockerfile -t 3reco --build-arg VERSION=v0.1.0 .

FROM node:22-alpine AS web
WORKDIR /src/web/apps/app
COPY web/apps/app/package.json web/apps/app/package-lock.json ./
RUN npm ci
COPY web/apps/app ./
RUN npm run build

FROM golang:1.27-alpine AS build
ARG VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags="-s -w -X github.com/connor-davis/3reco/internal/platform/config.Version=${VERSION}" \
    -o /out/3reco ./cmd/3reco

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/3reco /3reco
EXPOSE 8180
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["/3reco", "health"]
ENTRYPOINT ["/3reco"]
CMD ["serve"]
