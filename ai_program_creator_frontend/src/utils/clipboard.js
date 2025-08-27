//
// Clipboard utility: provides a robust copyToClipboard function with modern API and fallbacks.
//

/**
 * PUBLIC_INTERFACE
 * copyToClipboard
 * Copies the provided text to the user's clipboard.
 * - Uses navigator.clipboard.writeText when available and allowed (secure contexts).
 * - Falls back to document.execCommand('copy') via a hidden textarea when necessary.
 *
 * @param {string} text - The text to copy to the clipboard.
 * @returns {Promise<void>} Resolves when the text has been copied, rejects if copying fails.
 */
export async function copyToClipboard(text) {
  if (typeof text !== "string") {
    text = String(text ?? "");
  }

  // Prefer the async Clipboard API if available and context is secure
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (err) {
    // If writeText fails (permissions/denied/insecure), try fallback below
  }

  // Fallback: create a hidden textarea, select content, and execCommand('copy')
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;

      // Make it off-screen and minimal side-effects
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";

      document.body.appendChild(textarea);

      // Select and copy
      textarea.focus();
      textarea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (successful) {
        resolve();
      } else {
        reject(new Error("Copy command was unsuccessful."));
      }
    } catch (err) {
      // Ensure cleanup if something throws before removal
      try {
        const existing = document.querySelector("textarea[data-clipboard-temp='true']");
        if (existing && existing.parentNode) {
          existing.parentNode.removeChild(existing);
        }
      } catch (_) {
        // ignore
      }
      reject(err instanceof Error ? err : new Error("Failed to copy to clipboard."));
    }
  });
}

// Optional default export for convenience
export default {
  copyToClipboard,
};
