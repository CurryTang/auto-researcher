import { useState, useEffect } from 'react';
import axios from 'axios';
import DocumentList from './components/DocumentList';
import Settings from './components/Settings';

// Default API URL - can be changed in settings
const DEFAULT_API_URL = 'http://localhost:3000/api';

function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
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

      const { documents: newDocs, total } = response.data;

      if (reset) {
        setDocuments(newDocs);
        setOffset(LIMIT);
      } else {
        setDocuments((prev) => [...prev, ...newDocs]);
        setOffset((prev) => prev + LIMIT);
      }

      // Check if there are more documents to load
      const totalLoaded = reset ? newDocs.length : documents.length + newDocs.length;
      setHasMore(totalLoaded < total);
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
    </div>
  );
}

export default App;
