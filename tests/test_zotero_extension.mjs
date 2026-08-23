import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
let alerts = 0;
const context = {
  console,
  Components: {},
  IOUtils: {},
  PathUtils: { join: (...parts) => parts.join("/") },
  Services: {
    env: { get: () => "/run/user/1000" },
    prompt: { alert: () => alerts++ },
  },
  Zotero: { debug: () => {}, HTTP: {}, Sync: {} },
};
vm.runInNewContext(`${source}\n;globalThis.testAPI = { opaqueID, buildVoiceResponse, responseForAudio, reportFailure };`, context);
const api = context.testAPI;

const mary = { id: "sherpa/pocket/mary", name: "Mary", language: "en-US",
  languages: ["en-US"], provider: "local", model: "pocket" };
const bill = { id: "elevenlabs/bill", name: "Bill", language: "en-US",
  languages: ["en", "fr", "de"], provider: "elevenlabs", model: "flash" };

const maryID = api.opaqueID(mary);
api.buildVoiceResponse([mary, bill]);
const reordered = api.buildVoiceResponse([bill, mary]);
assert.equal(api.opaqueID(mary), maryID, "voice IDs must not depend on catalog order");
assert.ok(reordered.voices.standard[0].locales.fr.default.includes(api.opaqueID(bill)));
assert.equal(api.responseForAudio({ response: "audio", getResponseHeader: () => "no-store" }).noStore, true);
assert.equal(api.responseForAudio({ response: "audio", getResponseHeader: () => "private" }).noStore, false);
api.reportFailure({ name: "AbortError", message: "request aborted" });
assert.equal(alerts, 0, "canceled prefetch must not show a modal alert");

console.log("Zotero extension tests passed");
