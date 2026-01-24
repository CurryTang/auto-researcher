import DocumentCard from './DocumentCard';

function DocumentList({ documents, onDownload, onViewNotes, onToggleRead, loading }) {
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading documents...</p>
      </div>
    );
  }

  // Separate read and unread documents
  const unreadDocs = documents.filter(doc => !doc.isRead);
  const readDocs = documents.filter(doc => doc.isRead);

  return (
    <div className="document-list">
      {unreadDocs.length > 0 && (
        <>
          <h2 className="section-title">Unread ({unreadDocs.length})</h2>
          {unreadDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onDownload={onDownload}
              onViewNotes={onViewNotes}
              onToggleRead={onToggleRead}
            />
          ))}
        </>
      )}

      {readDocs.length > 0 && (
        <>
          <h2 className="section-title read-section">Read ({readDocs.length})</h2>
          {readDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onDownload={onDownload}
              onViewNotes={onViewNotes}
              onToggleRead={onToggleRead}
            />
          ))}
        </>
      )}
    </div>
  );
}

export default DocumentList;
