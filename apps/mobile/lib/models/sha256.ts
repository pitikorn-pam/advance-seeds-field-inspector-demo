import { sha256Base64Js } from "./sha256Js";

/**
 * SHA-256 of the bytes represented by a base64 string. Used to verify
 * downloaded model artifacts against the manifest hash.
 *
 * NOTE: We previously tried `expo-crypto.digestStringAsync` for a
 * native fast-path. That API treats the input as a UTF-8 string and
 * hashes the *base64 string itself*, not the decoded bytes — producing
 * a hash that never matches the manifest. expo-crypto has no public
 * API for hashing binary data, so we use the pure-JS implementation as
 * the canonical (and only) path.
 *
 * Cost on a 5–25 MB model: ~2–8 s on mid-range devices. We surface
 * `phase: "verifying"` to the install UI so the user sees what's
 * happening instead of a frozen progress bar.
 */
export async function sha256Base64(base64: string): Promise<string> {
  return sha256Base64Js(base64);
}
