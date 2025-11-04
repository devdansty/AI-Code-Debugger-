// frontend/src/App.js
import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import './App.css';

function AnalysisCard({ title, subtitle, children }) {
  return (
    <div className="card analysis-card">
      <div className="card-header">
        <strong>{title}</strong>
        {subtitle && <span className="small-muted">{subtitle}</span>}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState('javascript');
  const [errorOutput, setErrorOutput] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }

  // apply a suggested fix to editor (1-based inclusive)
  function applyFixToEditor(lineRange, suggestedFix) {
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!lineRange || lineRange.length !== 2) {
      // append
      const newVal = model.getValue() + '\n\n' + suggestedFix;
      model.setValue(newVal);
      return;
    }

    const [start, end] = lineRange;
    const s = Math.max(1, start);
    const e = Math.min(model.getLineCount(), end);
    const startPos = { lineNumber: s, column: 1 };
    const endPos = { lineNumber: e, column: model.getLineMaxColumn(e) };
    const range = new monacoRef.current.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);

    editor.executeEdits('apply-fix', [{ range, text: suggestedFix }]);
    editor.pushUndoStop();
  }

  function revealLine(line) {
    const editor = editorRef.current;
    if (!editor || !line) return;
    editor.revealLineInCenter(line);
    editor.setSelection({
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1
    });
    editor.focus();
  }

  async function handleDebug() {
    setLoading(true);
    setResponse(null);
    try {
      const res = await axios.post('http://localhost:4000/api/debug', {
        code: editorRef.current.getValue(),
        language,
        errorOutput
      });
      setResponse(res.data);
    } catch (e) {
      setResponse({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  const result = response?.result;

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🛠️</div>
          <div>
            <h1>AI Debugger</h1>
            <p className="subtitle">By Sameer and Ali Raza</p>
          </div>
        </div>

        <div className="controls">
          <select
            className="select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Select language"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="c++">C++</option>
          </select>

          <button className="btn primary" onClick={handleDebug} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Run Debug'}
          </button>
        </div>
      </header>

      <main className="main-grid">
        <section className="editor-card card">
          <div className="card-header">
            <strong>Editor</strong>
            <span className="small-muted">Write or paste code</span>
          </div>

          <div className="editor-wrap">
            <Editor
              height="100%"
              defaultLanguage={language}
              defaultValue={`function divide(a,b){ return a/b; }`}
              onMount={handleEditorMount}
              theme="vs-light"
            />
          </div>

          <div className="card-footer">
            <textarea
              className="error-box"
              placeholder="Optional error output / stack trace"
              value={errorOutput}
              onChange={(e) => setErrorOutput(e.target.value)}
            />
            <div className="footer-actions">
              <button className="btn secondary" onClick={() => { editorRef.current && editorRef.current.setValue(''); }}>Clear</button>
              <button className="btn" onClick={() => {
                const text = editorRef.current?.getValue() || '';
                navigator.clipboard.writeText(text);
              }}>Copy Code</button>
            </div>
          </div>
        </section>

        <aside className="panel">
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Summary Card */}
            <AnalysisCard title="Summary" subtitle="Brief overview">
              {!response && <div className="empty">No result yet. Click <b>Run Debug</b>.</div>}
              {response && response.error && <div className="alert danger">Error: {response.error}</div>}
              {response && response.success && result && <p>{result.summary}</p>}
            </AnalysisCard>

            {/* Issues Card */}
            <AnalysisCard title="Issues" subtitle="Detected problems">
              {response && response.success && result && (result.issues || []).length === 0 && <p className="small-muted">No issues found.</p>}

              {response && response.success && result && (
                <ul className="issues-list">
                  {(result.issues || []).map((iss, i) => (
                    <li key={i} className="issue-item">
                      <div className="issue-meta">
                        <span className="pill">{iss.type}</span>
                        {iss.line ? <button className="link-btn" onClick={() => revealLine(iss.line)}>Line {iss.line}</button> : <span className="small-muted">Line: N/A</span>}
                      </div>
                      <div className="issue-text">{iss.explanation}</div>
                    </li>
                  ))}
                </ul>
              )}

              {response && response.debug === 'static_syntax_error' && (
                <div style={{ marginTop: 8 }}>
                  <div className="alert warning">{response.result?.issues?.[0]?.explanation}</div>
                </div>
              )}
            </AnalysisCard>

            {/* Fixes Card */}
            <AnalysisCard title="Fixes" subtitle="Suggested code changes">
              {response && response.success && result && (result.fixes || []).length === 0 && <p className="small-muted">No fixes suggested.</p>}

              {response && response.success && result && (result.fixes || []).map((f, idx) => (
                <div key={idx} className="fix-card" style={{ marginBottom: 10 }}>
                  <div className="fix-meta">
                    <div><b>Lines:</b> {f.line_range ? `${f.line_range[0]}–${f.line_range[1]}` : 'N/A'}</div>
                    <div className="fix-actions">
                      <button className="btn tiny" onClick={() => applyFixToEditor(f.line_range, f.suggested_fix)}>Apply</button>
                      <button className="btn tiny ghost" onClick={() => navigator.clipboard.writeText(f.suggested_fix)}>Copy</button>
                    </div>
                  </div>
                  <pre className="fix-code">{f.suggested_fix}</pre>
                  <div className="small-muted" style={{ marginTop: 8 }}>{f.explanation}</div>
                </div>
              ))}
            </AnalysisCard>

            {/* Tests Card */}
            <AnalysisCard title="Tests to run" subtitle="How to verify fixes">
              {response && response.success && result && (result.tests_to_run || []).length === 0 && <p className="small-muted">No test suggestions.</p>}
              {response && response.success && result && (
                <ul>
                  {(result.tests_to_run || []).map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </AnalysisCard>

            {/* Confidence Card */}
            <AnalysisCard title="Confidence" subtitle="Model certainty">
              {response && response.success && result ? <div style={{ fontWeight: 600 }}>{result.confidence}</div> : <div className="small-muted">N/A</div>}
            </AnalysisCard>

            {/* Raw / Unparseable Card */}
            {response && response.debug === 'unparseable' && (
              <AnalysisCard title="Raw model output" subtitle="Unparseable — retry available">
                <pre className="raw-box">{response.raw_attempts?.join('\n\n---\n\n')}</pre>
                <div style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => handleDebug()}>Retry</button>
                </div>
              </AnalysisCard>
            )}
          </div>
        </aside>
      </main>

      <footer className="footer">
        <small></small>
      </footer>
    </div>
  );
}
