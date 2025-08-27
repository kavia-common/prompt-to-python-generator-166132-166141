const DEFAULT_TIMEOUT_MS = 20000; // 20s default timeout

// Resolve API base in the following priority:
// 1) process.env.REACT_APP_API_BASE (injected at build time)
// 2) window._API_BASE (runtime override)
// 3) relative '/api' (default, proxied by frontend)
const getBaseUrl = () => {
  try {
    if (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) {
      return process.env.REACT_APP_API_BASE.replace(/\/+$/, "");
    }
  } catch (_) {
    // ignore env access issues (e.g., tests)
  }
  if (typeof window !== "undefined" && window._API_BASE) {
    try {
      return String(window._API_BASE).replace(/\/+$/, "");
    } catch (_) {
      // ignore
    }
  }
  return "/api";
};

// Internal: fetch with timeout and basic error handling
async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(input, { ...init, signal: controller.signal });
    if (!resp.ok) {
      // Try to pull error details from response body if JSON
      let errorPayload;
      try {
        errorPayload = await resp.json();
      } catch (_) {
        errorPayload = { message: await resp.text() };
      }
      const err = new Error(errorPayload?.message || `Request failed with status ${resp.status}`);
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
    if (err.name === "AbortError") {
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
    throw new Error("Prompt must be a non-empty string.");
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
    throw new Error("Invalid response from server.");
  }
  const { code, requestId } = res;
  if (typeof code !== "string" || typeof requestId !== "string") {
    throw new Error("Server response missing required fields 'code' and 'requestId'.");
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
    throw new Error("requestId must be a non-empty string.");
  }
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    throw new Error("rating must be a number.");
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

// Optional default export for convenience
const api = {
  generateProgram,
  submitFeedback,
};

export default api;
