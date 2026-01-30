import { useState, useEffect } from 'react';
import axios from 'axios';
import DocumentList from './components/DocumentList';
import NotesModal from './components/NotesModal';
import UserNotesModal from './components/UserNotesModal';
import LoginModal from './components/LoginModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// API URL - use environment variable if available, otherwise production URL
const API_URL = import.meta.env.VITE_API_URL || 'https://auto-reader.duckdns.org/api';

function AppContent() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [initialNotesTab, setInitialNotesTab] = useState('paper');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [userNotesDocument, setUserNotesDocument] = useState(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [readFilter, setReadFilter] = useState('all'); // 'all', 'unread', 'read'
  const [showFilters, setShowFilters] = useState(false);

  const { isAuthenticated, isLoading: authLoading, logout, getAuthHeaders } = useAuth();

  const LIMIT = 5;

  // Fetch documents with pagination
  const fetchDocuments = async (reset = false) => {
    if (loading) return;

    setLoading(true);
    setError(null);

    const currentOffset = reset ? 0 : offset;

    try {
      const response = await axios.get(`${API_URL}/documents`, {
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
  }, []);

  // Fetch available tags
  const fetchTags = async () => {
    try {
      const response = await axios.get(`${API_URL}/tags`);
      setAllTags(response.data.tags || []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  // Filter and sort documents
  const filteredDocuments = documents
    .filter((doc) => {
      // Filter by search query
      const matchesSearch = !searchQuery ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase());

      // Filter by tag
      const matchesTag = !selectedTag ||
        (doc.tags && doc.tags.includes(selectedTag));

      // Filter by read status
      const matchesReadFilter = readFilter === 'all' ||
        (readFilter === 'unread' && !doc.isRead) ||
        (readFilter === 'read' && doc.isRead);

      return matchesSearch && matchesTag && matchesReadFilter;
    })
    // Sort: unread first, then by date
    .sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  // Get download URL for a document
  const getDownloadUrl = async (document) => {
    try {
      const response = await axios.get(`${API_URL}/documents/${document.id}/download`);
      return response.data.downloadUrl;
    } catch (err) {
      console.error('Failed to get download URL:', err);
      throw err;
    }
  };

  // Toggle read status for a document (requires auth)
  const toggleReadStatus = async (document) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      throw new Error('Authentication required');
    }

    try {
      const response = await axios.patch(
        `${API_URL}/documents/${document.id}/read`,
        {},
        { headers: getAuthHeaders() }
      );
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
      if (err.response?.status === 401 || err.response?.status === 403) {
        setShowLoginModal(true);
      }
      throw err;
    }
  };

  // Trigger code analysis for a document (requires auth)
  const triggerCodeAnalysis = async (document) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      throw new Error('Authentication required');
    }

    try {
      const response = await axios.post(
        `${API_URL}/code-analysis/${document.id}`,
        {},
        { headers: getAuthHeaders() }
      );

      // Update the document in state with new status
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === document.id ? { ...doc, codeAnalysisStatus: 'queued' } : doc
        )
      );

      return response.data;
    } catch (err) {
      console.error('Failed to trigger code analysis:', err);

      if (err.response?.status === 401 || err.response?.status === 403) {
        setShowLoginModal(true);
        throw new Error('Authentication required');
      }

      const message = err.response?.data?.message || err.response?.data?.error || 'Failed to queue analysis';

      // If already in progress, update the UI to show processing state
      if (message.includes('already in progress')) {
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === document.id ? { ...doc, codeAnalysisStatus: 'processing' } : doc
          )
        );
        // Don't throw error, just return
        return { success: false, message };
      }

      const error = new Error(message);
      error.response = err.response;
      throw error;
    }
  };

  // Delete a document (requires auth)
  const deleteDocument = async (document) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      throw new Error('Authentication required');
    }

    try {
      await axios.delete(
        `${API_URL}/documents/${document.id}`,
        { headers: getAuthHeaders() }
      );

      // Remove the document from state
      setDocuments((prev) => prev.filter((doc) => doc.id !== document.id));
    } catch (err) {
      console.error('Failed to delete document:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setShowLoginModal(true);
      }
      throw err;
    }
  };

  const handleAuthClick = () => {
    if (isAuthenticated) {
      logout();
    } else {
      setShowLoginModal(true);
    }
  };

  if (authLoading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Auto Reader</h1>
          <p className="subtitle">Your Research Library</p>
        </div>
        <div className="header-nav">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${readFilter === 'all' ? 'active' : ''}`}
              onClick={() => setReadFilter('all')}
            >
              All
            </button>
            <button
              className={`nav-tab ${readFilter === 'unread' ? 'active' : ''}`}
              onClick={() => setReadFilter('unread')}
            >
              Unread
            </button>
            <button
              className={`nav-tab ${readFilter === 'read' ? 'active' : ''}`}
              onClick={() => setReadFilter('read')}
            >
              Read
            </button>
          </div>
          <button
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Search & Filter"
          >
            🔍
          </button>
          <button
            className={`auth-btn ${isAuthenticated ? 'logged-in' : ''}`}
            onClick={handleAuthClick}
            title={isAuthenticated ? 'Logout' : 'Login'}
          >
            {isAuthenticated ? '🔓 Admin' : '🔒 Login'}
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
            <span className="filter-label">Tag:</span>
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
          {(searchQuery || selectedTag || readFilter !== 'all') && (
            <div className="active-filters">
              <span className="filter-count">
                Showing {filteredDocuments.length} of {documents.length} documents
              </span>
              <button
                className="clear-filters"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag(null);
                  setReadFilter('all');
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
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
          onViewNotes={(doc, tab = 'paper') => {
            setSelectedDocument(doc);
            setInitialNotesTab(tab);
          }}
          onViewUserNotes={(doc) => setUserNotesDocument(doc)}
          onToggleRead={toggleReadStatus}
          onTriggerCodeAnalysis={triggerCodeAnalysis}
          onDelete={deleteDocument}
          loading={loading && documents.length === 0}
          isAuthenticated={isAuthenticated}
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
        <p>Auto Reader {isAuthenticated && '(Admin Mode)'}</p>
      </footer>

      {selectedDocument && (
        <NotesModal
          document={selectedDocument}
          apiUrl={API_URL}
          initialTab={initialNotesTab}
          onClose={() => setSelectedDocument(null)}
          isAuthenticated={isAuthenticated}
          getAuthHeaders={getAuthHeaders}
          onAiEditStatusChange={(status) => {
            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === selectedDocument.id ? { ...doc, aiEditStatus: status } : doc
              )
            );
          }}
          onViewUserNotes={(doc) => {
            setSelectedDocument(null);
            setUserNotesDocument(doc);
          }}
        />
      )}

      {userNotesDocument && (
        <UserNotesModal
          document={userNotesDocument}
          apiUrl={API_URL}
          onClose={() => setUserNotesDocument(null)}
          isAuthenticated={isAuthenticated}
          getAuthHeaders={getAuthHeaders}
        />
      )}

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider apiUrl={API_URL}>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
