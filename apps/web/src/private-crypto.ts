type EncryptedPayload = {
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

export type EncryptedPrivateBundle = {
  encrypted: true;
  encryptedSource: EncryptedPayload;
  integrity: { algorithm: "sha256"; value: string };
};

const keyPrefix = "adaptab.private-key.";

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(source: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function wrapPrivateSource(source: string, origins: string[], pathPatterns: string[] = ["/*"]) {
  if (typeof source !== "string" || source.trim().length < 1 || source.length > 75000) {
    throw new Error("source must contain 1 through 75,000 characters.");
  }
  return `(async () => {\n  "use strict";\n  const ADAPTAB_PRIVATE_ORIGINS = ${JSON.stringify(origins)};\n  const ADAPTAB_PRIVATE_PATHS = ${JSON.stringify(pathPatterns)};\n  const adaptabPathMatches = (pattern, path) => {\n    const escaped = pattern.replace(/[|\\{}()[\\]^$+?.]/g, "\\\\$&").replace(/\\*/g, ".*");\n    return new RegExp("^" + escaped + "$").test(path);\n  };\n  if (!ADAPTAB_PRIVATE_ORIGINS.includes(location.origin)) throw new Error("AdapTab private origin guard rejected " + location.origin + ".");\n  if (!ADAPTAB_PRIVATE_PATHS.some((pattern) => adaptabPathMatches(pattern, location.pathname))) throw new Error("AdapTab private path guard rejected " + location.pathname + ".");\n  if (window.top !== window) throw new Error("AdapTab private adapters require a top-level document.");\n${source}\n})()`;
}

export async function encryptPrivateSource(source: string, origins: string[], pathPatterns: string[] = ["/*"]) {
  const wrappedSource = wrapPrivateSource(source, origins, pathPatterns);
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(wrappedSource)));
  return {
    encryptedSource: { algorithm: "AES-GCM" as const, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(ciphertext) },
    sourceHash: await sha256(wrappedSource),
    key: bytesToBase64Url(rawKey),
  };
}

export function savePrivateToolKey(toolId: string, key: string) {
  localStorage.setItem(keyPrefix + toolId, key);
}

export function hasPrivateToolKey(toolId: string) {
  return Boolean(localStorage.getItem(keyPrefix + toolId));
}

export async function decryptPrivateBundle(toolId: string, bundle: EncryptedPrivateBundle) {
  const encodedKey = localStorage.getItem(keyPrefix + toolId);
  if (!encodedKey) throw new Error("This encrypted adapter's local key is missing. Open it in the browser where it was imported or restore its key.");
  try {
    const key = await crypto.subtle.importKey("raw", base64UrlToBytes(encodedKey), "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(bundle.encryptedSource.iv) },
      key,
      base64UrlToBytes(bundle.encryptedSource.ciphertext),
    );
    const source = new TextDecoder().decode(plaintext);
    if (await sha256(source) !== bundle.integrity.value) throw new Error("Integrity mismatch.");
    return source;
  } catch (error) {
    if (error instanceof Error && error.message.includes("missing")) throw error;
    throw new Error("The private adapter could not be decrypted or failed its integrity check.");
  }
}

export async function materializePrivateBundle(bundle: Record<string, unknown>) {
  if (bundle.encrypted !== true) return bundle;
  const adapterId = typeof bundle.adapterId === "string" ? bundle.adapterId : "";
  const match = /^private\.([0-9a-f-]{36})$/i.exec(adapterId);
  if (!match) throw new Error("The encrypted private adapter identifier is invalid.");
  const source = await decryptPrivateBundle(match[1], bundle as unknown as EncryptedPrivateBundle);
  return { ...bundle, source, encryptedSource: undefined, decryptedInBrowser: true };
}
