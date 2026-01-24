import DocumentCard from './DocumentCard';

function DocumentList({ documents, onDownload, onViewNotes, loading }) {
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
        />
      ))}
    </div>
  );
}

export default DocumentList;
