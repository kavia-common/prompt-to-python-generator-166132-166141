import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import { generateProgram, submitFeedback, friendlyError } from './services/api';
import { copyToClipboard } from './utils/clipboard';

// Constants
const PROMPT_MAX = 1000;

// Simple Error Boundary to catch render errors and display a fallback UI
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' };
  }
  componentDidCatch(error, info) {
    // Optionally log to an error reporting service
    if (process && process.env && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, info);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="App">
          <header className="App-header">
            <div className="container">
              <div className="section">
                <h2>Unexpected error</h2>
                <p className="msg-error" role="alert" aria-live="assertive">{this.state.message}</p>
                <button className="btn" onClick={() => this.setState({ hasError: false, message: '' })}>
                  Dismiss
                </button>
              </div>
            </div>
          </header>
        </div>
      );
    }
    return this.props.children;
  }
}

// Basic inline styles to complement existing CSS without changing template structure
const styles = {
  container: {
    maxWidth: 920,
    width: '100%',
    padding: '24px',
    boxSizing: 'border-box',
  },
  section: {
    width: '100%',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    boxSizing: 'border-box',
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 8,
  },
  textarea: {
    width: '100%',
    minHeight: 140,
    resize: 'vertical',
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  button: {
    background: 'var(--button-bg)',
    color: 'var(--button-text)',
    border: 'none',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
  },
  subtle: {
    color: 'var(--text-secondary)',
    fontSize: 12,
  },
  codeWrap: {
    overflowX: 'auto',
    background: 'var(--bg-primary)',
    borderRadius: 8,
    padding: 16,
    border: '1px solid var(--border-color)',
  },
  error: {
    color: '#d9534f',
    background: 'rgba(217,83,79,0.1)',
    border: '1px solid rgba(217,83,79,0.35)',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    marginTop: 12,
  },
  feedbackRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingBtn: (active) => ({
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${active ? 'var(--button-bg)' : 'var(--border-color)'}`,
    background: active ? 'var(--button-bg)' : 'var(--bg-primary)',
    color: active ? 'var(--button-text)' : 'var(--text-primary)',
    cursor: 'pointer',
  }),
  commentInput: {
    flex: 1,
    minWidth: 220,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  // Copy button container aligned to the right above code block
  copyRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  copyBtnSecondary: {
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  },
  toast: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    padding: '10px 12px',
    borderRadius: 8,
    boxShadow: 'var(--shadow-md)',
    zIndex: 9999,
    fontSize: 14,
  },
};

// PUBLIC_INTERFACE
function App() {
  /**
   * Main application component for the AI Program Creator frontend.
   * Provides:
   * - Theme toggle
   * - Prompt input with character counter and submission
   * - Loading indicator and error handling
   * - Generated code display in pre/code
   * - Feedback section (rating + comment) after code is generated
   * Accessibility:
   * - Proper labels for inputs
   * - aria-live on status messages
   * - aria-busy on container when loading
   */
  const [theme, setTheme] = useState('light');

  // Form and API state
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  // Feedback state
  const [rating, setRating] = useState(null); // 1..5
  const [comment, setComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(null); // true | false | null

  // Copy-to-clipboard UX
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  // Derived
  const remaining = useMemo(() => PROMPT_MAX - prompt.length, [prompt]);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handlePromptChange = (e) => {
    const value = e.target.value;
    if (value.length <= PROMPT_MAX) {
      setPrompt(value);
    } else {
      setPrompt(value.slice(0, PROMPT_MAX));
    }
  };

  const canSubmit = useMemo(() => {
    return !loading && prompt.trim().length > 0;
  }, [loading, prompt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setFeedbackError('');
    setCopyError('');
    setCopied(false);
    setCode('');
    setRequestId('');
    setFeedbackSuccess(null);
    try {
      const res = await generateProgram(prompt.trim(), { timeoutMs: 30000 });
      setCode(res.code || '');
      setRequestId(res.requestId || '');
    } catch (err) {
      const message = friendlyError(err, 'Failed to generate code.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await copyToClipboard(code);
      setCopyError('');
      setCopied(true);
      // Auto-hide toast after 1.2s
      window.clearTimeout(handleCopy._t);
      handleCopy._t = window.setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      setCopied(false);
      setCopyError(err?.message || 'Failed to copy to clipboard.');
      // Hide error toast after 2s
      window.clearTimeout(handleCopy._e);
      handleCopy._e = window.setTimeout(() => setCopyError(''), 2000);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!requestId || rating == null || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    setFeedbackSuccess(null);
    setFeedbackError('');
    try {
      const res = await submitFeedback({ requestId, rating: Number(rating), comment }, { timeoutMs: 30000 });
      setFeedbackSuccess(!!res?.success);
    } catch (err) {
      setFeedbackSuccess(false);
      setFeedbackError(friendlyError(err, 'Could not submit feedback.'));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const resetFeedback = () => {
    setRating(null);
    setComment('');
    setFeedbackSuccess(null);
    setFeedbackError('');
  };

  return (
    <div className="App">
      <header
        className="App-header"
        aria-busy={loading ? 'true' : 'false'}
      >
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>

        <div style={styles.container}>
          <h1 style={{ margin: 0, fontSize: 28, textAlign: 'left' }}>AI Program Creator</h1>
          <p style={{ marginTop: 6, textAlign: 'left', color: 'var(--text-secondary)' }}>
            Describe the Python program you want. We&apos;ll generate a starting implementation.
          </p>

          <section style={styles.section}>
            <form onSubmit={handleSubmit} aria-describedby="prompt-help">
              <label htmlFor="prompt" style={styles.label}>Prompt</label>
              <textarea
                id="prompt"
                name="prompt"
                value={prompt}
                onChange={handlePromptChange}
                placeholder="E.g., Create a CLI that fetches weather for a city and prints a 3-day forecast."
                style={styles.textarea}
                aria-required="true"
              />
              <div style={styles.row}>
                <div id="prompt-help" style={styles.subtle} aria-live="polite">
                  {remaining} characters remaining
                </div>
                <button
                  type="submit"
                  style={styles.button}
                  disabled={!canSubmit}
                  aria-disabled={!canSubmit}
                >
                  {loading ? 'Generating…' : 'Generate Program'}
                </button>
              </div>
            </form>

            {error && (
              <div role="alert" style={styles.error} aria-live="assertive">
                {error}
              </div>
            )}

            {loading && (
              <div
                role="status"
                aria-live="polite"
                style={{ marginTop: 12, fontSize: 14 }}
              >
                Please wait while we generate your code…
              </div>
            )}
          </section>

          {code && (
            <section style={styles.section} aria-label="Generated code">
              <h2 style={{ marginTop: 0, fontSize: 20 }}>Generated Python Code</h2>

              <div style={styles.copyRow}>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={styles.copyBtnSecondary}
                  aria-label="Copy generated code to clipboard"
                  title="Copy to clipboard"
                >
                  📋 Copy
                </button>
              </div>

              <div style={styles.codeWrap}>
                <pre
                  style={{ margin: 0 }}
                  tabIndex={0}
                >
                  <code>
                    {code}
                  </code>
                </pre>
              </div>

              <div style={{ marginTop: 16 }}>
                <h3 style={{ margin: '8px 0 6px 0', fontSize: 16 }}>Your feedback</h3>
                <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
                  Rate the usefulness of this result and leave an optional comment.
                </p>

                {feedbackError && (
                  <div role="alert" aria-live="assertive" style={{ ...styles.error, marginBottom: 8 }}>
                    {feedbackError}
                  </div>
                )}
                <div style={styles.feedbackRow} role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRating(r)}
                      style={styles.ratingBtn(rating === r)}
                      aria-pressed={rating === r ? 'true' : 'false'}
                      aria-label={`${r} star${r > 1 ? 's' : ''}`}
                    >
                      {r}★
                    </button>
                  ))}
                </div>

                <div style={styles.feedbackRow}>
                  <label htmlFor="comment" style={{ ...styles.label, marginBottom: 0 }}>
                    Comment
                  </label>
                  <input
                    id="comment"
                    name="comment"
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional feedback"
                    style={styles.commentInput}
                  />
                  <button
                    type="button"
                    onClick={handleFeedbackSubmit}
                    style={styles.button}
                    disabled={!requestId || rating == null || feedbackSubmitting}
                    aria-disabled={!requestId || rating == null || feedbackSubmitting}
                    aria-busy={feedbackSubmitting ? 'true' : 'false'}
                  >
                    {feedbackSubmitting ? 'Submitting…' : 'Submit Feedback'}
                  </button>
                  <button
                    type="button"
                    onClick={resetFeedback}
                    style={{ ...styles.button, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                  >
                    Reset
                  </button>
                </div>

                {feedbackSuccess === true && (
                  <div role="status" aria-live="polite" style={{ ...styles.subtle, marginTop: 8 }}>
                    Thanks! Your feedback was recorded.
                  </div>
                )}
                {feedbackSuccess === false && (
                  <div role="alert" aria-live="assertive" style={{ ...styles.error, marginTop: 8 }}>
                    Could not submit feedback. Please try again later.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {(copied || copyError) && (
          <div
            role="status"
            aria-live="polite"
            style={{
              ...styles.toast,
              borderColor: copyError ? 'var(--error-border)' : 'var(--success-border)',
              background: copyError ? 'var(--error-bg)' : 'var(--success-bg)',
              color: copyError ? 'var(--error)' : 'var(--success)',
            }}
          >
            {copyError ? copyError : 'Copied to clipboard'}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;

// PUBLIC_INTERFACE
export function ErrorBoundaryWrapper() {
  /** Wrap App with an ErrorBoundary so unexpected render errors show a friendly fallback. */
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// Attach for convenient import as App.ErrorBoundaryWrapper in index.js if needed
App.ErrorBoundaryWrapper = ErrorBoundaryWrapper;
