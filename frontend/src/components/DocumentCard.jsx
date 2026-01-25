import { useState } from 'react';

function DocumentCard({ document, onDownload, onViewNotes, onViewCodeNotes, onToggleRead }) {
  const [downloading, setDownloading] = useState(false);
  const [togglingRead, setTogglingRead] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const downloadUrl = await onDownload(document);
      // Open download URL in new tab
      window.open(downloadUrl, '_blank');
    } catch (err) {
      setError('Failed to get download link');
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleToggleRead = async () => {
    setTogglingRead(true);
    try {
      await onToggleRead(document);
    } catch (err) {
      console.error('Toggle read error:', err);
    } finally {
      setTogglingRead(false);
    }
  };

  // Get type badge color
  const getTypeBadgeClass = (type) => {
    const classes = {
      paper: 'badge-paper',
      book: 'badge-book',
      blog: 'badge-blog',
      other: 'badge-other',
    };
    return classes[type] || 'badge-other';
  };

  // Get processing status badge
  const getStatusBadge = (status) => {
    if (!status) return null;

    const statusConfig = {
      pending: { label: 'Pending', className: 'status-pending' },
      queued: { label: 'Queued', className: 'status-queued' },
      processing: { label: 'Processing...', className: 'status-processing' },
      completed: { label: 'Ready', className: 'status-completed' },
      failed: { label: 'Failed', className: 'status-failed' },
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`status-badge ${config.className}`}>
        {config.label}
      </span>
    );
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const processingStatus = document.processingStatus || 'pending';
  const hasNotes = processingStatus === 'completed';
  const readerMode = document.readerMode || 'vanilla';

  // Get reader mode badge
  const getReaderModeBadge = () => {
    if (readerMode === 'auto_reader') {
      return <span className="reader-badge auto-reader" title="Multi-pass deep reading">Auto</span>;
    }
    return null; // Don't show badge for vanilla mode
  };

  return (
    <div className={`document-card ${document.isRead ? 'is-read' : ''}`}>
      <div className="document-info">
        <div className="document-header">
          <span className={`type-badge ${getTypeBadgeClass(document.type)}`}>
            {document.type}
          </span>
          {getStatusBadge(processingStatus)}
          {getReaderModeBadge()}
          {document.hasCode && (
            <span className="code-indicator" title="Has code repository">
              {'</>'}
            </span>
          )}
          <span className="document-date">{formatDate(document.createdAt)}</span>
        </div>
        <h3 className="document-title">{document.title}</h3>
        {document.originalUrl && (
          <a
            href={document.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="document-url"
          >
            {new URL(document.originalUrl).hostname}
          </a>
        )}
        {document.codeUrl && (
          <a
            href={document.codeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="document-code-url"
          >
            Code: {new URL(document.codeUrl).pathname.split('/').slice(1, 3).join('/')}
          </a>
        )}
        {document.tags && document.tags.length > 0 && (
          <div className="document-tags">
            {document.tags.map((tag, index) => (
              <span key={index} className="document-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="document-actions">
        <button
          className={`read-btn ${document.isRead ? 'is-read' : ''}`}
          onClick={handleToggleRead}
          disabled={togglingRead}
          title={document.isRead ? 'Mark as unread' : 'Mark as read'}
        >
          {togglingRead ? '...' : document.isRead ? '✓' : '○'}
        </button>
        {/* Paper Notes Button - show if completed or processing */}
        {hasNotes ? (
          <button
            className="notes-btn paper-notes-btn"
            onClick={() => onViewNotes(document, 'paper')}
            title="View paper notes"
          >
            📄 Paper
          </button>
        ) : (
          <button
            className="notes-btn status-btn"
            onClick={() => onViewNotes(document, 'paper')}
            title="View processing status"
          >
            📝 {processingStatus === 'processing' ? '...' : 'Status'}
          </button>
        )}
        {/* Code Notes Button - only show if has code and completed */}
        {document.hasCode && hasNotes && (
          <button
            className="notes-btn code-notes-btn"
            onClick={() => onViewNotes(document, 'code')}
            title="View code notes"
          >
            💻 Code
          </button>
        )}
        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <span className="btn-loading">...</span>
          ) : (
            <>
              <span className="download-icon">⬇</span>
              PDF
            </>
          )}
        </button>
        {error && <span className="download-error">{error}</span>}
      </div>
    </div>
  );
}

export default DocumentCard;
