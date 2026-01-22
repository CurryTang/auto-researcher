import { useState } from 'react';

function DocumentCard({ document, onDownload }) {
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

  return (
    <div className="document-card">
      <div className="document-info">
        <div className="document-header">
          <span className={`type-badge ${getTypeBadgeClass(document.type)}`}>
            {document.type}
          </span>
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
          className="download-btn"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <span className="btn-loading">...</span>
          ) : (
            <>
              <span className="download-icon">⬇</span>
              Download
            </>
          )}
        </button>
        {error && <span className="download-error">{error}</span>}
      </div>
    </div>
  );
}

export default DocumentCard;
