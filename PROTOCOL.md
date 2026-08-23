# Bridge protocol

The add-on connects only to `http://127.0.0.1:8766`. Every request sends
`Authorization: Bearer <token>`, where the token is read from
`$XDG_RUNTIME_DIR/uttermux-zotero.token`. UtterMux Linux creates that file with
mode `0600`.

Protocol schema 1 provides:

- `GET /health` → `{ "status": "ok", "schemaVersion": 1 }`
- `GET /v1/voices` → `{ "schemaVersion": 1, "cacheVersion": N, "voices": [...] }`
- `POST /v1/audio/speech` with `voice`, `input`, `language`, and `speed` → mono
  PCM16 WAV

Voice records contain stable broker ID, display name, native BCP-47 language,
provider, model, and supported languages. Requests are limited to 8,000 Unicode
characters. The bridge validates the Host header, token, voice ID, request size,
and speed range.

Local engines execute through a cancellation-aware FIFO because their runtime
instances are non-reentrant. Online providers permit two requests in flight.
Closing the HTTP request cancels the corresponding broker job. Local requests
retry once if the broker disconnects before a response is returned.

Local responses use `Cache-Control: private`; online responses use
`Cache-Control: no-store`. `cacheVersion` changes when exposed artifacts or
relevant UtterMux configuration changes.
