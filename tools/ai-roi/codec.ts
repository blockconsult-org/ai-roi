import { validateModel, type Model } from "./model";
export const STORAGE_KEY = "bc:ai-roi:draft:v1";
export const TRANSFER_KEY = "bc:ai-roi:locale:v1";
export const HASH_PREFIX = "#ai-roi=v1.";
export const MAX_JSON_BYTES = 24_000;
export const MAX_ENCODED_LENGTH = 8_000;
const encoder = new TextEncoder();
export function parseModel(text: string): Model {
  if (text.length > MAX_JSON_BYTES || encoder.encode(text).length > MAX_JSON_BYTES) throw new Error("size");
  const parsed: unknown = JSON.parse(text);
  if (!validateModel(parsed)) throw new Error("model");
  return parsed;
}
export function serializeModel(model: Model): string {
  if (!validateModel(model)) throw new Error("model");
  return JSON.stringify(model, null, 2);
}
export function shareModel(model: Model, includeText = false): Model {
  if (!validateModel(model)) throw new Error("model");
  return { ...model, title: includeText ? model.title : "", notes: includeText ? model.notes : "" };
}
export function encodeShare(model: Model, includeText = false): string {
  const bytes = encoder.encode(JSON.stringify(shareModel(model, includeText)));
  if (bytes.length > MAX_JSON_BYTES) throw new Error("size");
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("size");
  return HASH_PREFIX + encoded;
}
export function decodeShare(hash: string): Model {
  if (!hash.startsWith(HASH_PREFIX) || hash.length > HASH_PREFIX.length + MAX_ENCODED_LENGTH) throw new Error("link");
  const payload = hash.slice(HASH_PREFIX.length);
  if (!/^[\w-]+$/.test(payload)) throw new Error("link");
  const binary = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
  if (binary.length > MAX_JSON_BYTES) throw new Error("size");
  return parseModel(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
}
