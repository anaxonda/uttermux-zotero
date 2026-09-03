import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
let alerts = 0;
const originalVoices = async function () {
  return { voices: { standard: [] }, standardCreditsRemaining: null,
    premiumCreditsRemaining: null, devMode: false };
};
const originalAudio = async function () { return { audio: "upstream" }; };
function APIClient() {}
APIClient.prototype.getReadAloudVoices = originalVoices;
APIClient.prototype.getReadAloudAudio = originalAudio;
const context = {
  console,
  Components: {},
  IOUtils: { readUTF8: async () => "test-token" },
  PathUtils: { join: (...parts) => parts.join("/") },
  Services: {
    env: { get: () => "/run/user/1000" },
    prompt: { alert: () => alerts++ },
  },
  Zotero: {
    debug: () => {}, HTTP: {}, version: "10.0.1",
    initializationPromise: Promise.resolve(), Sync: { APIClient },
  },
};
vm.runInNewContext(`${source}\n;globalThis.testAPI = {
  opaqueID, buildVoiceResponse, responseForAudio, reportFailure,
  supportedVersion, startup, shutdown, bridgeRequest,
  bridgeIsValidated: () => bridgeValidated,
};`, context);
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

assert.equal(api.supportedVersion("9.0.4"), true);
assert.equal(api.supportedVersion("10.0.1"), true);
assert.equal(api.supportedVersion("10.1.0"), false);
assert.equal(api.supportedVersion("11.0"), false);

await api.startup();
const firstVoicesWrapper = APIClient.prototype.getReadAloudVoices;
const firstAudioWrapper = APIClient.prototype.getReadAloudAudio;
assert.notEqual(firstVoicesWrapper, originalVoices);
assert.notEqual(firstAudioWrapper, originalAudio);
await api.startup();
assert.equal(APIClient.prototype.getReadAloudVoices, firstVoicesWrapper,
  "startup must be idempotent");
api.shutdown();
assert.equal(APIClient.prototype.getReadAloudVoices, originalVoices);
assert.equal(APIClient.prototype.getReadAloudAudio, originalAudio);

const precedingWrapper = async function () { return { voices: { standard: [] }, source: "other" }; };
APIClient.prototype.getReadAloudVoices = precedingWrapper;
await api.startup();
api.shutdown();
assert.equal(APIClient.prototype.getReadAloudVoices, precedingWrapper,
  "shutdown must restore a wrapper installed before UtterMux");

await api.startup();
const uttermuxWrapper = APIClient.prototype.getReadAloudVoices;
const followingWrapper = async function (...args) {
  return uttermuxWrapper.apply(this, args);
};
APIClient.prototype.getReadAloudVoices = followingWrapper;
api.shutdown();
assert.equal(APIClient.prototype.getReadAloudVoices, followingWrapper,
  "shutdown must not overwrite a later wrapper");
const passiveResult = await new APIClient().getReadAloudVoices();
assert.equal(passiveResult.source, "other",
  "a retained UtterMux wrapper must become a passive pass-through");

APIClient.prototype.getReadAloudVoices = originalVoices;
APIClient.prototype.getReadAloudAudio = undefined;
await assert.rejects(api.startup(), /contract is unavailable/);
APIClient.prototype.getReadAloudAudio = originalAudio;

context.Zotero.version = "11.0.0";
await assert.rejects(api.startup(), /supports Zotero 9\.0\.x and 10\.0\.x/);

context.Zotero.HTTP.request = async () => { throw new Error("bridge restarted"); };
await assert.rejects(api.bridgeRequest("GET", "/health"), /bridge restarted/);
assert.equal(api.bridgeIsValidated(), false);

console.log("Zotero extension tests passed");
