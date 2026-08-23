# UtterMux for Zotero

UtterMux for Zotero connects Zotero Read Aloud to the
[UtterMux Linux](https://github.com/anaxonda/uttermux-linux) voice broker. It
uses Zotero's remote-audio controller so UtterMux can synthesize upcoming
sentences while the current sentence plays.

The add-on does not contain a TTS runtime or credentials. It requires UtterMux
Linux with bridge protocol schema 1 and currently supports Zotero 9.0.x.

## Install

1. Install or update UtterMux Linux.
2. Enable its authenticated loopback bridge:

   ```sh
   uttermux zotero enable
   uttermux zotero status
   ```

3. Download `uttermux-zotero-<version>.xpi` from this repository's latest
   release.
4. In Zotero, open **Tools → Plugins**, choose **Install Plugin From File**, and
   select the XPI.
5. Restart Zotero. UtterMux favorites appear in the **Standard** Read Aloud
   voice group.

Use `uttermux zotero disable` to stop and disable the bridge.

## Design

```text
Zotero remote-audio controller
    │  three-sentence lookahead, two fetches
UtterMux for Zotero
    │  authenticated HTTP on 127.0.0.1:8766
UtterMux Linux bridge
    │  broker protocol over the user Unix socket
uttermuxd
    ├── local models
    └── online providers
```

The add-on patches Zotero's private `getReadAloudVoices()` and
`getReadAloudAudio()` methods without modifying Zotero's installation. This API
is version-sensitive, so each Zotero major release is tested before the
manifest compatibility range is raised.

Local audio may be stored in Zotero's Read Aloud cache. Online-provider audio
is marked `no-store`. Document text, tokens, and provider credentials are not
written to add-on logs.

See [PROTOCOL.md](PROTOCOL.md) for the bridge contract and
[SECURITY.md](SECURITY.md) for the trust model.

## Development

```sh
node tests/test_zotero_extension.mjs
scripts/build-xpi
unzip -t dist/uttermux-zotero-*.xpi
```

The add-on is GPL-3.0-or-later. Relevant upstream references include Zotero
Reader's [remote controller](https://github.com/zotero/reader/blob/master/src/common/read-aloud/remote/controller.ts),
Zotero's [Read Aloud API client](https://github.com/zotero/zotero/blob/master/chrome/content/zotero/xpcom/sync/syncAPIClient.js),
and [zotero-local-tts](https://github.com/NightLightTw/zotero-local-tts).
