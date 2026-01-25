import { useState } from 'react';

function DocumentCard({ document, onDownload, onViewNotes, onToggleRead, onTriggerCodeAnalysis }) {
  const [downloading, setDownloading] = useState(false);
  const [togglingRead, setTogglingRead] = useState(false);
  const [triggeringAnalysis, setTriggeringAnalysis] = useState(false);
  const [error, setError] = useState(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const downloadUrl = await onDownload(document);
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

  const handleTriggerCodeAnalysis = async () => {
    if (!onTriggerCodeAnalysis) return;
    setTriggeringAnalysis(true);
    setError(null);
    try {
      await onTriggerCodeAnalysis(document);
    } catch (err) {
      // Show the actual error message from the API
      setError(err.message || 'Failed to queue analysis');
      console.error('Code analysis error:', err);
    } finally {
      setTriggeringAnalysis(false);
    }
  };

  const getTypeBadgeClass = (type) => {
    const classes = {
      paper: 'badge-paper',
      book: 'badge-book',
      blog: 'badge-blog',
      other: 'badge-other',
    };
    return classes[type] || 'badge-other';
  };

  const getStatusBadge = (status) => {
    if (!status) return null;
    const statusConfig = {
      pending: { label: 'Pending', className: 'status-pending' },
      queued: { label: 'Queued', className: 'status-queued' },
      processing: { label: 'Processing', className: 'status-processing' },
      completed: { label: 'Ready', className: 'status-completed' },
      failed: { label: 'Failed', className: 'status-failed' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <span className={`status-badge ${config.className}`}>{config.label}</span>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const processingStatus = document.processingStatus || 'pending';
  const hasNotes = processingStatus === 'completed';
  const readerMode = document.readerMode || 'vanilla';
  const codeAnalysisStatus = document.codeAnalysisStatus;

  const getReaderModeBadge = () => {
    if (readerMode === 'auto_reader') {
      return <span className="reader-badge auto-reader" title="Multi-pass deep reading">Auto</span>;
    }
    return null;
  };

  const renderCodeButton = () => {
    if (!document.hasCode || !hasNotes) return null;

    if (codeAnalysisStatus === 'completed') {
      return (
        <button className="action-btn code-btn" onClick={() => onViewNotes(document, 'code')} title="View code analysis">
          Code
        </button>
      );
    }

    if (codeAnalysisStatus === 'queued') {
      return <button className="action-btn waiting-btn" disabled title="Waiting in queue">Waiting...</button>;
    }

    if (codeAnalysisStatus === 'processing') {
      return <button className="action-btn waiting-btn" disabled title="Analysis in progress">Analyzing...</button>;
    }

    if (codeAnalysisStatus === 'failed') {
      return (
        <button className="action-btn code-btn" onClick={handleTriggerCodeAnalysis} disabled={triggeringAnalysis} title="Retry code analysis">
          {triggeringAnalysis ? '...' : 'Retry'}
        </button>
      );
    }

    return (
      <button className="action-btn code-btn" onClick={handleTriggerCodeAnalysis} disabled={triggeringAnalysis} title="Deep code analysis (Opus, ~30 min)">
        {triggeringAnalysis ? '...' : 'Analyze'}
      </button>
    );
  };

  return (
    <div className={`document-card ${document.isRead ? 'is-read' : ''}`}>
      <div className="document-info">
        <div className="document-header">
          <span className={`type-badge ${getTypeBadgeClass(document.type)}`}>{document.type}</span>
          {getStatusBadge(processingStatus)}
          {getReaderModeBadge()}
          {document.hasCode && <span className="code-indicator" title="Has code repository">{'</>'}</span>}
          <span className="document-date">{formatDate(document.createdAt)}</span>
        </div>
        <h3 className="document-title">{document.title}</h3>
        {document.originalUrl && (
          <a href={document.originalUrl} target="_blank" rel="noopener noreferrer" className="document-url">
            {new URL(document.originalUrl).hostname}
          </a>
        )}
        {document.codeUrl && (
          <a href={document.codeUrl} target="_blank" rel="noopener noreferrer" className="document-code-url">
            Code: {new URL(document.codeUrl).pathname.split('/').slice(1, 3).join('/')}
          </a>
        )}
        {document.tags && document.tags.length > 0 && (
          <div className="document-tags">
            {document.tags.map((tag, index) => <span key={index} className="document-tag">{tag}</span>)}
          </div>
        )}
      </div>
      <div className="document-actions">
        <button
          className={`action-btn read-btn ${document.isRead ? 'is-read' : ''}`}
          onClick={handleToggleRead}
          disabled={togglingRead}
          title={document.isRead ? 'Mark as unread' : 'Mark as read'}
        >
          {togglingRead ? '...' : document.isRead ? '✓ Read' : 'Read'}
        </button>
        {hasNotes ? (
          <button className="action-btn paper-btn" onClick={() => onViewNotes(document, 'paper')} title="View paper notes">
            Paper
          </button>
        ) : (
          <button className="action-btn status-btn" onClick={() => onViewNotes(document, 'paper')} title="View processing status">
            {processingStatus === 'processing' ? '...' : 'Status'}
          </button>
        )}
        {renderCodeButton()}
        <button className="action-btn pdf-btn" onClick={handleDownload} disabled={downloading}>
          {downloading ? '...' : 'PDF'}
        </button>
        {error && <span className="download-error">{error}</span>}
      </div>
    </div>
  );
}

export default DocumentCard;
