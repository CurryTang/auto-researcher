import DocumentCard from './DocumentCard';

function DocumentList({ documents, onDownload, onViewNotes, onToggleRead, onTriggerCodeAnalysis, onDelete, loading, isAuthenticated }) {
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="document-list">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onDownload={onDownload}
          onViewNotes={onViewNotes}
          onToggleRead={onToggleRead}
          onTriggerCodeAnalysis={onTriggerCodeAnalysis}
          onDelete={onDelete}
          isAuthenticated={isAuthenticated}
        />
      ))}
    </div>
  );
}

export default DocumentList;
