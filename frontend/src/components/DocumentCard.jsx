import { useState } from 'react';

function DocumentCard({ document, onDownload, onViewNotes }) {
  const [downloading, setDownloading] = useState(false);
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

  return (
    <div className="document-card">
      <div className="document-info">
        <div className="document-header">
          <span className={`type-badge ${getTypeBadgeClass(document.type)}`}>
            {document.type}
          </span>
          {getStatusBadge(processingStatus)}
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
      </div>
      <div className="document-actions">
        <button
          className="notes-btn"
          onClick={() => onViewNotes(document)}
          title={hasNotes ? 'View AI-generated notes' : 'View processing status'}
        >
          {hasNotes ? '📝 Notes' : '📝'}
        </button>
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
