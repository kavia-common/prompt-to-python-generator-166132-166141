const DEFAULT_TIMEOUT_MS = 30000; // 30s default timeout

/**
 * Always use a relative base for API calls so the frontend hits:
 *   /api/generate
 *   /api/feedback
 * which can be proxied by the dev server or served by the same origin in production.
 */
const getBaseUrl = () => "/api";

/**
 * Normalize various server error shapes to a concise message.
 */
function toUserMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (err.code === "ETIMEOUT") return "Request timed out. Please try again.";
  if (typeof err === "string") return err;
  if (err.message) return err.message;

  const payload = err.payload || err.data;
  if (payload) {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
    if (payload.errors && Array.isArray(payload.errors) && payload.errors.length) {
      const first = payload.errors[0];
      if (typeof first === "string") return first;
      if (first && typeof first.message === "string") return first.message;
    }
  }
  return fallback;
}

// Internal: fetch with timeout and basic error handling
async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    if (!resp.ok) {
      // Try to pull error details from response body if JSON
      let errorPayload;
      try {
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          errorPayload = await resp.json();
        } else {
          const txt = await resp.text();
          errorPayload = txt ? { message: txt } : {};
        }
      } catch (_) {
        errorPayload = {};
      }
      const err = new Error(
        errorPayload?.message || `Request failed with status ${resp.status}`
      );
      err.status = resp.status;
      err.payload = errorPayload;
      throw err;
    }
    // Prefer JSON responses
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await resp.json();
    }
    // Fallback to text if not JSON
    return await resp.text();
  } catch (err) {
    if (err && err.name === "AbortError") {
      const timeoutError = new Error("Request timed out");
      timeoutError.code = "ETIMEOUT";
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// PUBLIC_INTERFACE
export async function generateProgram(prompt, options = {}) {
  /**
   * Submit a generation request to the backend.
   * @param {string} prompt - The prompt describing the desired program.
   * @param {object} [options] - Optional settings.
   * @param {number} [options.timeoutMs] - Override request timeout in ms.
   * @returns {Promise<{code: string, requestId: string}>} - Generated code and request id.
   * @throws {Error} - On network, timeout, or server errors.
   */
  if (typeof prompt !== "string" || !prompt.trim()) {
    const e = new Error("Prompt must be a non-empty string.");
    e.userMessage = "Please enter a prompt before submitting.";
    throw e;
  }
  const base = getBaseUrl();
  const body = JSON.stringify({ prompt: prompt.trim() });
  const res = await fetchWithTimeout(
    `${base}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    },
    options.timeoutMs
  );

  // Ensure normalized shape { code, requestId }
  if (typeof res !== "object" || res === null) {
    const e = new Error("Invalid response from server.");
    e.userMessage = "The server returned an unexpected response.";
    throw e;
  }
  const { code, requestId } = res;
  if (typeof code !== "string" || typeof requestId !== "string") {
    const e = new Error("Server response missing required fields 'code' and 'requestId'.");
    e.userMessage = "The server response is missing data needed to show your code.";
    throw e;
  }
  return { code, requestId };
}

// PUBLIC_INTERFACE
export async function submitFeedback({ requestId, rating, comment = "" }, options = {}) {
  /**
   * Submit user feedback for a generation request.
   * @param {object} params
   * @param {string} params.requestId - The related request ID.
   * @param {number} params.rating - Numeric rating (e.g., 1-5).
   * @param {string} [params.comment] - Optional feedback text.
   * @param {object} [options] - Optional settings.
   * @param {number} [options.timeoutMs] - Override request timeout in ms.
   * @returns {Promise<{success: boolean}>} - Submission status.
   * @throws {Error} - On validation, network, timeout, or server errors.
   */
  if (typeof requestId !== "string" || !requestId.trim()) {
    const e = new Error("requestId must be a non-empty string.");
    e.userMessage = "Cannot submit feedback: missing request ID. Please regenerate and try again.";
    throw e;
  }
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    const e = new Error("rating must be a number.");
    e.userMessage = "Please select a rating before submitting feedback.";
    throw e;
  }

  const base = getBaseUrl();
  const payload = { requestId: requestId.trim(), rating, comment: String(comment || "") };

  const res = await fetchWithTimeout(
    `${base}/feedback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    options.timeoutMs
  );

  // Normalize to { success: boolean }
  if (typeof res === "object" && res !== null && typeof res.success === "boolean") {
    return { success: res.success };
  }
  // If server doesn't return 'success', assume ok since fetchWithTimeout would have thrown otherwise.
  return { success: true };
}

// PUBLIC_INTERFACE
export function friendlyError(err, fallback) {
  /** Return a concise, user-readable error message from an Error or payload. */
  return toUserMessage(err, fallback);
}

// Optional default export for convenience
const api = {
  generateProgram,
  submitFeedback,
  friendlyError,
};

export default api;
