import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function NotesModal({ document, apiUrl, onClose }) {
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="notes-modal">
        <div className="notes-modal-header">
          <h2>Notes: {document.title}</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

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

          {notes && !notes.hasNotes && (
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

          {notes && notes.hasNotes && notes.notesContent && (
            <div className="notes-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {notes.notesContent}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div className="notes-modal-footer">
          {notes && notes.notesUrl && (
            <a
              href={notes.notesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-notes-btn"
            >
              Download Notes (.md)
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
