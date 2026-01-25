import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const AUTH_TOKEN_KEY = 'auto_reader_auth_token';

export function AuthProvider({ children, apiUrl }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(true);

  // Get stored token
  const getToken = useCallback(() => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }, []);

  // Verify token with backend
  const verifyToken = useCallback(async (token) => {
    if (!token) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return false;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      setAuthEnabled(data.authEnabled !== false);

      if (data.valid || data.authEnabled === false) {
        setIsAuthenticated(true);
        setIsLoading(false);
        return true;
      } else {
        // Token is invalid, clear it
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setIsAuthenticated(false);
        setIsLoading(false);
        return false;
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      setIsLoading(false);
      return false;
    }
  }, [apiUrl]);

  // Check stored token on mount
  useEffect(() => {
    const token = getToken();
    verifyToken(token);
  }, [getToken, verifyToken]);

  // Login with token
  const login = useCallback(async (token) => {
    const isValid = await verifyToken(token);
    if (isValid) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      return true;
    }
    return false;
  }, [verifyToken]);

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setIsAuthenticated(false);
  }, []);

  // Get auth headers for API calls
  const getAuthHeaders = useCallback(() => {
    const token = getToken();
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  }, [getToken]);

  const value = {
    isAuthenticated,
    isLoading,
    authEnabled,
    login,
    logout,
    getToken,
    getAuthHeaders,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
