import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import DocumentList from './components/DocumentList';
import NotesModal from './components/NotesModal';
import UserNotesModal from './components/UserNotesModal';
import LoginModal from './components/LoginModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// API URL strategy:
// - Development: always prefer local Vite proxy (/api) unless explicitly overridden
//   with VITE_DEV_API_URL.
// - Production: use VITE_API_URL when provided, otherwise default public endpoint.
const DEV_API_URL = import.meta.env.VITE_DEV_API_URL || '/api';
const PROD_API_URL = import.meta.env.VITE_API_URL || 'https://auto-reader.duckdns.org/api';
const API_URL = import.meta.env.DEV ? DEV_API_URL : PROD_API_URL;
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

function getApiErrorMessage(err, fallback) {
  if (err?.response?.status === 500) {
    return 'Backend API unavailable. Start backend with: cd backend && npm run dev';
  }
  if (err?.response?.status === 504) {
    return 'Backend query timed out. Retry in a few seconds.';
  }
  if (err?.code === 'ECONNABORTED') {
    return `Request timed out after ${Math.round(API_TIMEOUT_MS / 1000)}s. Please retry.`;
  }
  if (err?.message?.includes('Network Error')) {
    return 'Cannot connect to backend API.';
  }
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [readFilter, setReadFilter] = useState('unread'); // 'all', 'unread', 'read'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'oldest', 'alpha'
  const [showFilters, setShowFilters] = useState(false);

  const { isAuthenticated, isLoading: authLoading, logout, getAuthHeaders } = useAuth();

  const LIMIT = 10;

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

  // Build API params from current filter state
  const buildParams = (offsetVal) => {
    const apiSort = sortOrder === 'alpha' ? 'title' : 'createdAt';
    const apiOrder = sortOrder === 'oldest' ? 'asc' : (sortOrder === 'alpha' ? 'asc' : 'desc');
    const params = { limit: LIMIT, offset: offsetVal, sort: apiSort, order: apiOrder };
    if (debouncedSearch) params.search = debouncedSearch;
    if (readFilter !== 'all') params.readFilter = readFilter;
    if (selectedTag) params.tags = selectedTag;
    return params;
  };

  // Fetch docs on mount and when any server-side filter changes
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    axios.get(`${API_URL}/documents`, {
      params: buildParams(0),
      timeout: API_TIMEOUT_MS,
    })
      .then(response => {
        if (fetchIdRef.current !== id) return; // stale request
        const { documents: newDocs = [], hasMore: apiHasMore } = response.data;
        setDocuments(newDocs);
        setOffset(newDocs.length);
        setHasMore(typeof apiHasMore === 'boolean' ? apiHasMore : newDocs.length === LIMIT);
      })
      .catch(err => {
        if (fetchIdRef.current !== id) return;
        console.error('Failed to fetch documents:', err);
        setError(getApiErrorMessage(err, 'Failed to fetch documents'));
      })
      .finally(() => {
        if (fetchIdRef.current === id) setLoading(false);
      });
  }, [sortOrder, debouncedSearch, readFilter, selectedTag, refreshTrigger]);

  // Load more (append)
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/documents`, {
        params: buildParams(offset),
        timeout: API_TIMEOUT_MS,
      });
      const { documents: newDocs = [], hasMore: apiHasMore } = response.data;
      setDocuments(prev => [...prev, ...newDocs]);
      setOffset(prev => prev + newDocs.length);
      setHasMore(typeof apiHasMore === 'boolean' ? apiHasMore : newDocs.length === LIMIT);
    } catch (err) {
      console.error('Failed to load more:', err);
      setError(getApiErrorMessage(err, 'Failed to load more'));
    } finally {
      setLoading(false);
    }
  };

  // Fetch tags once on mount
  useEffect(() => { fetchTags(); }, []);

  // Fetch available tags
  const fetchTags = async () => {
    try {
      const response = await axios.get(`${API_URL}/tags`, { timeout: API_TIMEOUT_MS });
      setAllTags(response.data.tags || []);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  };

  // Documents are already filtered and sorted by the backend
  const filteredDocuments = documents;

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
          <div className="sort-filter">
            <span className="filter-label">Sort:</span>
            <div className="sort-chips">
              <button
                className={`tag-chip ${sortOrder === 'newest' ? 'active' : ''}`}
                onClick={() => setSortOrder('newest')}
              >
                Newest first
              </button>
              <button
                className={`tag-chip ${sortOrder === 'oldest' ? 'active' : ''}`}
                onClick={() => setSortOrder('oldest')}
              >
                Oldest first
              </button>
              <button
                className={`tag-chip ${sortOrder === 'alpha' ? 'active' : ''}`}
                onClick={() => setSortOrder('alpha')}
              >
                A-Z
              </button>
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
            <button onClick={() => setRefreshTrigger((prev) => prev + 1)}>Retry</button>
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

        {documents.length > 0 && hasMore && (
          <div className="load-more-container">
            <button
              className="load-more-btn"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

        {documents.length > 0 && !hasMore && (
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
          onViewAiNotes={(doc) => {
            setUserNotesDocument(null);
            setSelectedDocument(doc);
          }}
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
