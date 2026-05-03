import * as Crypto from "expo-crypto";
import { sha256Base64Js } from "./sha256Js";

/**
 * SHA-256 of the bytes represented by a base64 string.
 *
 * Tries the native `expo-crypto` digest first (10–20× faster, doesn't
 * block the JS thread). Falls back to a pure-JS implementation when the
 * native module isn't present in the running binary — e.g. an older
 * dev client built before we added the dependency. Once we observe
 * the native module is missing we latch the flag so we don't pay the
 * try/catch cost on every artifact verification.
 */
let nativeDigestUnavailable = false;

export async function sha256Base64(base64: string): Promise<string> {
  if (!nativeDigestUnavailable) {
    try {
      return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
        encoding: Crypto.CryptoEncoding.HEX,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/ExpoCrypto|native module|nil/i.test(message)) {
        nativeDigestUnavailable = true;
        console.warn(
          "[sha256] expo-crypto native module unavailable; falling back to JS digest. Rebuild the dev client to restore native speed.",
        );
      } else {
        throw e;
      }
    }
  }
  return sha256Base64Js(base64);
}
