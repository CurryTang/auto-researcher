import { useState, useEffect } from 'react';
import axios from 'axios';
import DocumentList from './components/DocumentList';
import Settings from './components/Settings';
import NotesModal from './components/NotesModal';

// Default API URL - can be changed in settings
const DEFAULT_API_URL = 'http://138.68.5.132:3000/api';

function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [apiUrl, setApiUrl] = useState(() => {
    return localStorage.getItem('apiUrl') || DEFAULT_API_URL;
  });

  const LIMIT = 5;

  // Fetch documents with pagination
  const fetchDocuments = async (reset = false) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    const currentOffset = reset ? 0 : offset;

    try {
      const response = await axios.get(`${apiUrl}/documents`, {
        params: {
          limit: LIMIT,
          offset: currentOffset,
          sort: 'createdAt',
          order: 'desc',
        },
      });

      const { documents: newDocs } = response.data;

      // Filter out failed documents
      const filteredDocs = newDocs.filter(doc => doc.processingStatus !== 'failed');

      if (reset) {
        setDocuments(filteredDocs);
        setOffset(LIMIT);
      } else {
        setDocuments((prev) => [...prev, ...filteredDocs]);
        setOffset((prev) => prev + LIMIT);
      }

      // Check if there are more documents to load
      // If we got fewer docs than requested, we've reached the end
      setHasMore(newDocs.length === LIMIT);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchDocuments(true);
  }, [apiUrl]);

  // Handle API URL change
  const handleApiUrlChange = (newUrl) => {
    localStorage.setItem('apiUrl', newUrl);
    setApiUrl(newUrl);
    setDocuments([]);
    setOffset(0);
    setHasMore(true);
  };

  // Get download URL for a document
  const getDownloadUrl = async (document) => {
    try {
      const response = await axios.get(`${apiUrl}/documents/${document.id}/download`);
      return response.data.downloadUrl;
    } catch (err) {
      console.error('Failed to get download URL:', err);
      throw err;
    }
  };

  // Toggle read status for a document
  const toggleReadStatus = async (document) => {
    try {
      const response = await axios.patch(`${apiUrl}/documents/${document.id}/read`);
      const { isRead } = response.data;

      // Update the document in state
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === document.id ? { ...doc, isRead } : doc
        )
      );

      return isRead;
    } catch (err) {
      console.error('Failed to toggle read status:', err);
      throw err;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Auto Reader</h1>
          <p className="subtitle">Your Research Library</p>
        </div>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {showSettings && (
        <Settings
          apiUrl={apiUrl}
          onApiUrlChange={handleApiUrlChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      <main className="main">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => fetchDocuments(true)}>Retry</button>
          </div>
        )}

        <DocumentList
          documents={documents}
          onDownload={getDownloadUrl}
          onViewNotes={(doc) => setSelectedDocument(doc)}
          onToggleRead={toggleReadStatus}
          loading={loading && documents.length === 0}
        />

        {documents.length > 0 && hasMore && (
          <div className="load-more-container">
            <button
              className="load-more-btn"
              onClick={() => fetchDocuments(false)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

        {documents.length > 0 && !hasMore && (
          <p className="end-message">You've reached the end</p>
        )}

        {documents.length === 0 && !loading && !error && (
          <div className="empty-state">
            <p>No documents found</p>
            <p className="hint">Save some papers using the Chrome extension!</p>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Auto Reader - Test Frontend</p>
      </footer>

      {selectedDocument && (
        <NotesModal
          document={selectedDocument}
          apiUrl={apiUrl}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
}

export default App;
