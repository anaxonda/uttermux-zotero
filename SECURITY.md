# Security

Report vulnerabilities through the repository's private GitHub security
advisory form.

This is a full-privilege Zotero add-on. Install XPIs only from this repository's
release page and verify the published SHA-256 file when appropriate.

The bridge binds to loopback, requires a random user-runtime token, rejects
non-loopback Host headers, bounds request size and concurrency, and never logs
document text or authentication material. It does not expose provider
credentials to Zotero. Online-provider text is still subject to the selected
provider's privacy policy and terms.
