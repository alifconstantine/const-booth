import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Free Online Photobooth | Long-Distance Couples & Friends',
  description:
    'Online photobooth for long-distance couples and friends. Take photo strips together from anywhere, or try the solo booth. Free, no app.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/assets/favicon.svg', type: 'image/svg+xml' },
      { url: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }
    ],
    apple: [{ url: '/assets/icon-180.png', sizes: '180x180' }]
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/shared/design-system.css" />
        <link rel="stylesheet" href="/shared/layout-system.css" />
        <link rel="stylesheet" href="/shared/header-v3.css" />
        <link rel="stylesheet" href="/shared/footer.css" />
        <link rel="stylesheet" href="/shared/accessibility.css" />
        <link rel="stylesheet" href="/shared/feedback.css" />
        <link rel="stylesheet" href="/shared/skeleton.css" />
        {/* Core synchronous runtime dependencies */}
        <script src="/js/config.js"></script>
        <script src="/shared/lb-realtime.js"></script>
        <script src="/shared/loader-v4.min.js"></script>
        <script src="/js/booth-link-entry.js" defer></script>
        <script src="/js/booth-full-guard.js" defer></script>
      </head>
      <body>
        {children}
        <script src="/shared/skeleton-loader.js" defer></script>
        <script src="/shared/header.min.js" defer></script>
        <script src="/shared/feedback.min.js" defer></script>
        {/* Global safety fallback to ensure loaders hide on page ready */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('pageshow', function() {
                if (window.hideLoader) window.hideLoader();
                var l = document.getElementById('lensbooth-global-loader');
                if (l) l.classList.remove('visible');
              });
            `
          }}
        />
      </body>
    </html>
  );
}
