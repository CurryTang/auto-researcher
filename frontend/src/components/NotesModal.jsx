import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content) {
  if (!content) return { metadata: null, content: '' };

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) return { metadata: null, content };

  const frontmatter = match[1];
  const markdownContent = content.slice(match[0].length);

  // Parse simple YAML (key: value pairs)
  const metadata = {};
  frontmatter.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      metadata[key] = value;
    }
  });

  return { metadata, content: markdownContent };
}

function NotesModal({ document, apiUrl, initialTab = 'paper', onClose }) {
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab); // 'paper' or 'code'

  // Parse the paper notes content to separate frontmatter
  const parsedPaperNotes = useMemo(() => {
    if (!notes?.notesContent) return null;
    return parseFrontmatter(notes.notesContent);
  }, [notes?.notesContent]);

  // Parse the code notes content to separate frontmatter
  const parsedCodeNotes = useMemo(() => {
    if (!notes?.codeNotesContent) return null;
    return parseFrontmatter(notes.codeNotesContent);
  }, [notes?.codeNotesContent]);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/documents/${document.id}/notes?inline=true`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch notes');
        }

        setNotes(data);
        // Respect initialTab, but fallback if the requested tab has no content
        if (initialTab === 'code' && data.hasCodeNotes) {
          setActiveTab('code');
        } else if (initialTab === 'paper' && data.hasNotes) {
          setActiveTab('paper');
        } else if (data.hasCodeNotes && !data.hasNotes) {
          setActiveTab('code');
        } else if (data.hasNotes) {
          setActiveTab('paper');
        }
      } catch (err) {
        console.error('Error fetching notes:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [document.id, apiUrl]);

  // Handle click outside to close
  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getReaderModeBadge = (mode) => {
    if (mode === 'auto_reader') {
      return <span className="reader-mode-badge auto-reader">Auto Reader</span>;
    }
    return <span className="reader-mode-badge vanilla">Vanilla</span>;
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="notes-modal">
        <div className="notes-modal-header">
          <div className="header-title-row">
            <h2>Notes: {document.title}</h2>
            {notes?.readerMode && getReaderModeBadge(notes.readerMode)}
          </div>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Tabs for paper/code notes */}
        {notes && (notes.hasNotes || notes.hasCodeNotes) && (
          <div className="notes-tabs">
            <button
              className={`notes-tab ${activeTab === 'paper' ? 'active' : ''}`}
              onClick={() => setActiveTab('paper')}
              disabled={!notes.hasNotes}
            >
              Paper Notes
            </button>
            <button
              className={`notes-tab ${activeTab === 'code' ? 'active' : ''}`}
              onClick={() => setActiveTab('code')}
              disabled={!notes.hasCodeNotes}
            >
              Code Notes
              {notes.hasCodeNotes && <span className="code-badge">Available</span>}
            </button>
          </div>
        )}

        {/* Code URL info */}
        {notes?.codeUrl && (
          <div className="code-url-info">
            <span className="code-label">Code Repository:</span>
            <a href={notes.codeUrl} target="_blank" rel="noopener noreferrer" className="code-link">
              {notes.codeUrl}
            </a>
          </div>
        )}

        <div className="notes-modal-content">
          {loading && (
            <div className="notes-loading">
              <div className="spinner"></div>
              <p>Loading notes...</p>
            </div>
          )}

          {error && (
            <div className="notes-error">
              <p>Error: {error}</p>
            </div>
          )}

          {notes && !notes.hasNotes && !notes.hasCodeNotes && (
            <div className="notes-empty">
              <p>No notes available yet.</p>
              <p className="notes-status">
                Processing status: <strong>{notes.processingStatus}</strong>
              </p>
              {notes.processingStatus === 'pending' && (
                <p className="hint">This document will be processed automatically.</p>
              )}
              {notes.processingStatus === 'queued' && (
                <p className="hint">This document is in the processing queue.</p>
              )}
              {notes.processingStatus === 'processing' && (
                <p className="hint">This document is currently being processed...</p>
              )}
              {notes.processingStatus === 'failed' && (
                <p className="hint error">Processing failed. Please try again later.</p>
              )}
            </div>
          )}

          {/* Paper Notes Tab */}
          {activeTab === 'paper' && notes && notes.hasNotes && parsedPaperNotes && (
            <div className="notes-markdown">
              {parsedPaperNotes.metadata?.generated_at && (
                <div className="notes-meta">
                  <span className="meta-label">Generated:</span>
                  <span className="meta-value">
                    {new Date(parsedPaperNotes.metadata.generated_at).toLocaleString()}
                  </span>
                  {parsedPaperNotes.metadata?.mode && (
                    <>
                      <span className="meta-label">Mode:</span>
                      <span className="meta-value">{parsedPaperNotes.metadata.mode}</span>
                    </>
                  )}
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {parsedPaperNotes.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Code Notes Tab */}
          {activeTab === 'code' && notes && notes.hasCodeNotes && parsedCodeNotes && (
            <div className="notes-markdown code-notes">
              {parsedCodeNotes.metadata?.generated_at && (
                <div className="notes-meta">
                  <span className="meta-label">Generated:</span>
                  <span className="meta-value">
                    {new Date(parsedCodeNotes.metadata.generated_at).toLocaleString()}
                  </span>
                  {parsedCodeNotes.metadata?.code_url && (
                    <>
                      <span className="meta-label">Repository:</span>
                      <span className="meta-value">
                        <a href={parsedCodeNotes.metadata.code_url} target="_blank" rel="noopener noreferrer">
                          {parsedCodeNotes.metadata.code_url}
                        </a>
                      </span>
                    </>
                  )}
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {parsedCodeNotes.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Empty state for selected tab */}
          {activeTab === 'paper' && notes && !notes.hasNotes && notes.hasCodeNotes && (
            <div className="notes-empty">
              <p>No paper notes available.</p>
              <p className="hint">Switch to Code Notes tab to view code analysis.</p>
            </div>
          )}

          {activeTab === 'code' && notes && !notes.hasCodeNotes && notes.hasNotes && (
            <div className="notes-empty">
              <p>No code notes available.</p>
              {notes.hasCode ? (
                <p className="hint">Code analysis is being processed or encountered an error.</p>
              ) : (
                <p className="hint">This paper does not have associated code.</p>
              )}
            </div>
          )}
        </div>

        <div className="notes-modal-footer">
          {activeTab === 'paper' && notes && notes.notesUrl && (
            <a
              href={notes.notesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-notes-btn"
            >
              Download Paper Notes (.md)
            </a>
          )}
          {activeTab === 'code' && notes && notes.codeNotesUrl && (
            <a
              href={notes.codeNotesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-notes-btn"
            >
              Download Code Notes (.md)
            </a>
          )}
          <button className="close-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotesModal;
