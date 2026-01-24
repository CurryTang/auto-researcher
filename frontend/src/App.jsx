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

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

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
    fetchTags();
  }, [apiUrl]);

  // Fetch available tags
  const fetchTags = async () => {
    try {
      const response = await axios.get(`${apiUrl}/tags`);
      setAllTags(response.data.tags || []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  // Filter documents by search query and tag
  const filteredDocuments = documents.filter((doc) => {
    // Filter by search query
    const matchesSearch = !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by tag
    const matchesTag = !selectedTag ||
      (doc.tags && doc.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });

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
        <div className="header-actions">
          <button
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Search & Filter"
          >
            🔍
          </button>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showFilters && (
        <div className="filter-panel">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>
          <div className="tag-filter">
            <span className="filter-label">Filter by tag:</span>
            <div className="tag-chips">
              <button
                className={`tag-chip ${!selectedTag ? 'active' : ''}`}
                onClick={() => setSelectedTag(null)}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  className={`tag-chip ${selectedTag === tag.name ? 'active' : ''}`}
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                  style={selectedTag === tag.name ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
          {(searchQuery || selectedTag) && (
            <div className="active-filters">
              <span className="filter-count">
                Showing {filteredDocuments.length} of {documents.length} documents
              </span>
              <button
                className="clear-filters"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag(null);
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

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
          documents={filteredDocuments}
          onDownload={getDownloadUrl}
          onViewNotes={(doc) => setSelectedDocument(doc)}
          onToggleRead={toggleReadStatus}
          loading={loading && documents.length === 0}
        />

        {documents.length > 0 && hasMore && !searchQuery && !selectedTag && (
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

        {documents.length > 0 && !hasMore && !searchQuery && !selectedTag && (
          <p className="end-message">You've reached the end</p>
        )}

        {filteredDocuments.length === 0 && !loading && !error && (
          <div className="empty-state">
            {documents.length === 0 ? (
              <>
                <p>No documents found</p>
                <p className="hint">Save some papers using the Chrome extension!</p>
              </>
            ) : (
              <>
                <p>No matching documents</p>
                <p className="hint">Try adjusting your search or filters</p>
              </>
            )}
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
