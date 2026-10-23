import { Metadata } from 'next';
import allTemplatesData from '@/public/assets/all-templates.json';

export const metadata: Metadata = {
  title: 'Pilih Template Photobooth | ConstBooth',
  description:
    'Jelajahi dan pilih template photostrip karya para creator untuk photobooth kamu. Tersedia strip 1:3, postcard 2:3, dan frame aesthetic.',
};

export default function Page() {
  return (
    <>
      <link rel="stylesheet" href="/shared/design-system.css" />
      <link rel="stylesheet" href="/shared/layout-system.css" />
      <link rel="stylesheet" href="/shared/header-v3.css" />
      <link rel="stylesheet" href="/shared/footer.css" />
      <link rel="stylesheet" href="/css/template-selection.css" />

      {/* Accessibility skip link */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Mobile Header */}
      <header className="mobile-header">
        <a
          href="/booth"
          className="mobile-back-btn"
          id="mobile-back-btn"
          aria-label="Go Back to Booth"
          title="Back"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </a>
        <a href="/" className="mobile-logo" aria-label="ConstBooth">
          <img
            src="/assets/logo.svg?v=35ddb567"
            alt="ConstBooth"
            className="logo-img"
            width="112"
            height="30"
          />
        </a>
        <a
          href="/profile"
          className="mobile-login-btn"
          id="mobile-login-btn"
          aria-label="Profile"
          title="Profile"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </a>
      </header>

      {/* Desktop Main Header */}
      <header className="main-header full-header lb-nav-bar">
        <div className="header-left">
          <a
            href="/booth"
            id="nav-back-btn"
            className="nav-back-btn"
            aria-label="Back to Booth"
            title="Back"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </a>
        </div>
        <a href="/" id="logo-trigger" className="app-logo" aria-label="ConstBooth">
          <img
            src="/assets/logo.svg?v=35ddb567"
            alt="ConstBooth"
            className="logo-img"
            width="134"
            height="36"
          />
        </a>
        <div className="header-actions">
          <a
            href="/profile"
            className="nav-login-btn"
            id="nav-login-btn"
            aria-label="Profile"
            title="Profile"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </a>
        </div>
      </header>

      {/* Main Template Selection Application Shell */}
      <main>
        <div id="template-selection-app" className="ts-page-wrap">
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <div
              style={{
                display: 'inline-block',
                width: '36px',
                height: '36px',
                border: '3px solid #e5e7eb',
                borderTopColor: '#7c3aed',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginBottom: '16px'
              }}
            />
            <p style={{ fontSize: '15px', fontWeight: 600 }}>Memuat template photobooth...</p>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer>
        <nav className="lb-minimal-legal" aria-label="Legal & Information">
          <div className="lb-minimal-legal-inner">
            <div className="lb-minimal-brand">
              <a href="/" className="lb-minimal-logo" aria-label="ConstBooth">
                <img
                  src="/assets/logo-footer.svg?v=b1cb43c4"
                  alt="ConstBooth"
                  className="footer-logo-img"
                  width="112"
                  height="30"
                />
              </a>
              <span className="lb-minimal-copy">&copy; 2026 ConstBooth. All rights reserved.</span>
            </div>
            <div className="lb-minimal-links"><a href="/booth">Booth</a><a href="/studio">Studio</a></div>
          </div>
        </nav>
      </footer>

      {/* Inlined templates data for instant 0ms rendering */}
      <script
        id="all-templates-data"
        dangerouslySetInnerHTML={{
          __html: `window.__ALL_TEMPLATES_DATA__ = ${JSON.stringify(allTemplatesData)};`
        }}
      />

      {/* Load Template Selection Vanilla Controller */}
      <script src="/js/template-selection.js" defer></script>

      {/* Navigation back button safety hook */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              function wireBackLink() {
                try {
                  var backBtns = document.querySelectorAll("#nav-back-btn, #mobile-back-btn");
                  Array.prototype.forEach.call(backBtns, function (btn) {
                    btn.setAttribute("href", "/booth");
                    btn.addEventListener("click", function () {
                      try {
                        localStorage.removeItem("boothType");
                        localStorage.removeItem("targetUrl");
                        localStorage.removeItem("lb_booth_id");
                        sessionStorage.removeItem("lb_booth_id");
                        sessionStorage.removeItem("lb_strip_locked");
                        sessionStorage.removeItem("lb_solo_skip_booth");
                      } catch (e) {}
                    });
                  });
                } catch (e) {}
              }
              if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", wireBackLink);
              } else {
                wireBackLink();
              }
            })();
          `
        }}
      />
    </>
  );
}
