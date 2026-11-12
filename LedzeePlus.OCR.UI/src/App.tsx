import { useState, useEffect } from 'react';
import './App.css';
import Login from './Login/Login';
import { Upload } from './Upload/Upload';
import { Document } from './Upload/Document';
import type { ExtractedInvoiceData } from './types/invoice';
import { authService, type UserRecord } from './services/authService';

export function App() {
  const [currentUser, setCurrentUser] = useState<Omit<UserRecord, 'password'> | null>(() =>
    authService.getCurrentUser()
  );

  // Navigation views: 'login' -> 'upload' -> 'workspace'
  const [currentView, setCurrentView] = useState<'login' | 'upload' | 'workspace'>(() =>
    authService.isAuthenticated() ? 'upload' : 'login'
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // State to hold extracted invoice data
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);

  // Sync user state on view change
  useEffect(() => {
    setCurrentUser(authService.getCurrentUser());
  }, [currentView]);

  // Callback when login completes
  const handleLoginSuccess = () => {
    setCurrentUser(authService.getCurrentUser());
    setCurrentView('upload');
  };

  // Callback when upload completes
  const handleUploadComplete = (data: ExtractedInvoiceData) => {
    setExtractedData(data);
    setCurrentView('workspace');
  };

  const handleSignOut = () => {
    authService.logout();
    setCurrentUser(null);
    setUserMenuOpen(false);
    setExtractedData(null);
    setCurrentView('login');
  };

  // Compute Initials
  const initials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AD';

  // 1. Initial View: Login Screen
  if (currentView === 'login') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. Post-Login Views: Upload & Workspace
  return (
    <div className="app-root" onClick={() => setUserMenuOpen(false)}>
      {/* TOP NAVBAR (ALWAYS VISIBLE AFTER LOGIN) */}
      <header className="app-navbar">
        <div className="navbar-container">
          <div className="navbar-left">
            <img
              src="/navanala-logo-full.png"
              alt="NavaNala Technologies"
              className="navbar-brand-logo"
              onClick={() => setCurrentView('upload')}
              style={{ cursor: 'pointer' }}
            />
          </div>

          <div className="navbar-right">
            {/* Logged-In User Profile */}
            <div
              className="navbar-user-chip"
              onClick={(e) => {
                e.stopPropagation();
                setUserMenuOpen(!userMenuOpen);
              }}
              title="Logged in user profile"
            >
              <div className="user-avatar-wrap">
                <span className="user-avatar-text">{initials}</span>
                <span className="user-status-dot"></span>
              </div>
              <div className="user-details-text">
                <span className="user-fullname">{currentUser?.name || 'Authenticated User'}</span>
                <span className="user-subrole">{currentUser?.role || 'Accounting'}</span>
              </div>
              <i className="bi bi-chevron-down user-dropdown-caret"></i>

              {userMenuOpen && (
                <div
                  className="user-menu-dropdown"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="user-menu-header">
                    <strong>{currentUser?.name || 'User'}</strong>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{currentUser?.email}</span>
                    {currentUser?.gstin && (
                      <span style={{
                        marginTop: '4px',
                        fontSize: '10px',
                        background: '#eff6ff',
                        color: '#0b66c2',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        fontFamily: 'monospace'
                      }}>
                        GSTIN: {currentUser.gstin}
                      </span>
                    )}
                  </div>
                  <div className="user-menu-divider"></div>
                  <button className="user-menu-item" type="button">
                    <i className="bi bi-building"></i> {currentUser?.companyName || 'Business Portal'}
                  </button>
                  <div className="user-menu-divider"></div>
                  <button
                    className="user-menu-item text-danger"
                    type="button"
                    onClick={handleSignOut}
                  >
                    <i className="bi bi-box-arrow-right"></i> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className={`main-wrapper ${currentView === 'workspace' ? 'workspace-mode' : ''}`}>
        {currentView === 'upload' && (
          <Upload onUploadComplete={handleUploadComplete} />
        )}

        {currentView === 'workspace' && extractedData && (
          <Document
            data={extractedData}
            onBack={() => setCurrentView('upload')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
