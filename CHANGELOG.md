# Changelog

## 0.2.0 - 2026-09-03

- Added Zotero 10.0.x compatibility while retaining Zotero 9.0.x support.
- Made API patching idempotent and safe around other method wrappers.
- Revalidate the bridge contract after service or transport failures.
- Added an installed-Zotero Read Aloud contract checker.

## 0.1.1 - 2026-08-22

- Added stable voice identifiers across favorite and catalog reordering.
- Exposed multilingual voices under every declared language.
- Preserved active voice mappings across catalog refreshes.
- Validated bridge and voice schema versions.
- Honored the bridge's local/cloud cache policy.
- Suppressed alerts for canceled prefetch requests.

## 0.1.0 - 2026-08-22

- Initial Zotero 9 Read Aloud integration using UtterMux's authenticated
  loopback bridge and Zotero's sentence-lookahead audio controller.
