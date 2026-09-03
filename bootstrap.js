/* global Components, IOUtils, PathUtils, Services, Zotero */

"use strict";

const NAME = "UtterMux for Zotero";
const SUPPORTED_VERSIONS = new Set(["9.0", "10.0"]);
const PATCH_KEY = Symbol.for("uttermux-zotero.patch.v1");
const BRIDGE = "http://127.0.0.1:8766";
const SAMPLE = "UtterMux is ready to read this document with the selected voice.";

let patchState;
let voiceMap = new Map();
let lastNotice = 0;
let bridgeValidated = false;

function log(message) {
  Zotero.debug(`${NAME}: ${message}`);
}

function runtimeTokenPath() {
  const runtime = Services.env.get("XDG_RUNTIME_DIR");
  if (!runtime) {
    throw new Error("XDG_RUNTIME_DIR is unavailable");
  }
  return PathUtils.join(runtime, "uttermux-zotero.token");
}

async function token() {
  const value = (await IOUtils.readUTF8(runtimeTokenPath())).trim();
  if (!value) throw new Error("UtterMux Zotero token is empty");
  return value;
}

async function bridgeRequest(method, path, options = {}) {
  const authorization = await token();
  try {
    return await Zotero.HTTP.request(method, `${BRIDGE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${authorization}`,
        ...(options.headers || {}),
      },
      successCodes: [200],
      errorDelayMax: 500,
    });
  }
  catch (error) {
    // Recheck the bridge schema after a service restart or transport failure.
    bridgeValidated = false;
    throw error;
  }
}

function supportedVersion(version) {
  const match = /^(\d+)\.(\d+)/.exec(String(version));
  return Boolean(match && SUPPORTED_VERSIONS.has(`${match[1]}.${match[2]}`));
}

function opaqueID(record) {
  // A stable identifier is required because favorites can change catalog order
  // while a reader still has prefetched segments for the selected voice.
  let hash = 2166136261;
  for (const character of record.id) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `uttermux-${record.provider || "voice"}-${(hash >>> 0).toString(16)}`;
}

function buildVoiceResponse(records, cacheVersion = 1) {
  const labels = {};
  const locales = {};
  records.forEach((record, index) => {
    const id = opaqueID(record);
    const existing = voiceMap.get(id);
    if (existing && existing.id !== record.id) {
      throw new Error(`UtterMux voice identifier collision for ${record.id}`);
    }
    voiceMap.set(id, record);
    labels[id] = { label: record.name, default: index === 0 };
    const declared = [record.language || "en-US", ...(record.languages || [])];
    for (const locale of [...new Set(declared.filter(Boolean))]) {
      if (!locales[locale]) locales[locale] = { default: [], other: [] };
      (locales[locale].default.length ? locales[locale].other : locales[locale].default).push(id);
    }
  });
  return {
    voices: {
      standard: records.length ? [{
        creditsPerMinute: 0,
        segmentGranularity: "sentence",
        sentenceDelay: 0,
        cacheVersion,
        locales,
        voices: labels,
      }] : [],
    },
    standardCreditsRemaining: null,
    premiumCreditsRemaining: null,
    devMode: false,
  };
}

async function localVoiceResponse() {
  if (!bridgeValidated) {
    const health = await bridgeRequest("GET", "/health", { responseType: "json" });
    if (health.response?.schemaVersion !== 1) {
      throw new Error(`Unsupported UtterMux bridge schema ${health.response?.schemaVersion ?? "unknown"}`);
    }
    bridgeValidated = true;
  }
  const response = await bridgeRequest("GET", "/v1/voices", { responseType: "json" });
  if (response.response?.schemaVersion !== 1) {
    throw new Error(`Unsupported UtterMux voice schema ${response.response?.schemaVersion ?? "unknown"}`);
  }
  const records = Array.isArray(response.response?.voices) ? response.response.voices : [];
  return buildVoiceResponse(records, Number(response.response.cacheVersion) || 1);
}

async function mergedVoices(client) {
  const state = patchState;
  let local;
  try {
    local = await localVoiceResponse();
  } catch (error) {
    reportFailure(error);
    local = { voices: { standard: [] }, standardCreditsRemaining: null,
      premiumCreditsRemaining: null, devMode: false };
  }
  try {
    const upstream = await state.baseVoices.call(client);
    if (upstream?.error || !upstream?.voices) return local;
    return {
      ...upstream,
      voices: {
        ...upstream.voices,
        standard: [...local.voices.standard, ...(upstream.voices.standard || [])],
      },
    };
  } catch (error) {
    log(`upstream voice listing failed (${error?.name || "Error"})`);
    return local;
  }
}

function reportFailure(error) {
  const description = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  if (description.includes("abort") || description.includes("cancel")) {
    log("discarded canceled prefetch request");
    return;
  }
  log(`bridge request failed (${error?.name || "Error"}, status=${error?.status || error?.xmlhttp?.status || 0})`);
  const now = Date.now();
  if (now - lastNotice < 30000) return;
  lastNotice = now;
  try {
    Services.prompt.alert(null, NAME,
      "UtterMux could not synthesize this segment. Confirm the Zotero bridge service is running, then retry.");
  } catch (_error) {}
}

function responseForAudio(response) {
  const cacheControl = response.getResponseHeader("Cache-Control") || "";
  return {
    audio: response.response,
    noStore: /(?:^|,)\s*no-store\s*(?:,|$)/i.test(cacheControl),
  };
}

async function getAudio(segment, voiceID) {
  const state = patchState;
  const voice = voiceMap.get(voiceID);
  if (!voice) return state.baseAudio.call(this, segment, voiceID);
  const input = segment === "sample" ? SAMPLE : segment?.text;
  if (!input || typeof input !== "string") return { error: "unknown" };
  try {
    const response = await bridgeRequest("POST", "/v1/audio/speech", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: voice.id, input, language: voice.language, speed: 1.0 }),
      responseType: "blob",
    });
    return responseForAudio(response);
  } catch (error) {
    reportFailure(error);
    return { error: "unknown" };
  }
}

async function startup() {
  await Zotero.initializationPromise;
  if (!supportedVersion(Zotero.version)) {
    throw new Error(`${NAME} supports Zotero 9.0.x and 10.0.x; found ${Zotero.version}`);
  }
  const prototype = Zotero.Sync?.APIClient?.prototype;
  if (!prototype || typeof prototype.getReadAloudVoices !== "function"
      || typeof prototype.getReadAloudAudio !== "function") {
    throw new Error(`${NAME}: Zotero Read Aloud API contract is unavailable`);
  }
  let state = prototype[PATCH_KEY];
  if (!state) {
    state = {
      baseVoices: prototype.getReadAloudVoices,
      baseAudio: prototype.getReadAloudAudio,
      enabled: false,
      mergeVoices: null,
      getAudio: null,
    };
    state.voicesWrapper = async function (...args) {
      if (state.enabled && state.mergeVoices) return state.mergeVoices(this);
      return state.baseVoices.apply(this, args);
    };
    state.audioWrapper = async function (...args) {
      if (state.enabled && state.getAudio) return state.getAudio.apply(this, args);
      return state.baseAudio.apply(this, args);
    };
    Object.defineProperty(prototype, PATCH_KEY, { value: state, configurable: true });
    prototype.getReadAloudVoices = state.voicesWrapper;
    prototype.getReadAloudAudio = state.audioWrapper;
  }
  state.mergeVoices = mergedVoices;
  state.getAudio = getAudio;
  state.enabled = true;
  patchState = state;
  log(`enabled for Zotero ${Zotero.version}`);
}

function shutdown() {
  const prototype = Zotero.Sync?.APIClient?.prototype;
  const state = patchState || prototype?.[PATCH_KEY];
  if (!prototype || !state) return;
  state.enabled = false;
  state.mergeVoices = null;
  state.getAudio = null;
  if (prototype.getReadAloudVoices === state.voicesWrapper) {
    prototype.getReadAloudVoices = state.baseVoices;
  }
  if (prototype.getReadAloudAudio === state.audioWrapper) {
    prototype.getReadAloudAudio = state.baseAudio;
  }
  if (prototype.getReadAloudVoices === state.baseVoices
      && prototype.getReadAloudAudio === state.baseAudio) {
    delete prototype[PATCH_KEY];
  }
  patchState = null;
  voiceMap.clear();
  bridgeValidated = false;
  log("disabled and restored Zotero methods");
}

function install() {}
function uninstall() {}
