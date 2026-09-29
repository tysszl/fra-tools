// @ts-check
// Share links: keep the page URL in step with its settings, and hand the link to the
// system share sheet on phones or the clipboard elsewhere.
import { copyText } from "./clipboard.js";

/** @param {URLSearchParams} params */
export function replaceUrl(params) {
  const query = params.toString();
  history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/**
 * @param {string} url
 * @param {string} title
 * @returns {Promise<"shared" | "copied" | "failed">}
 */
export async function shareUrl(url, title) {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (coarse && navigator.share) {
    try {
      await navigator.share({ url, title });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
