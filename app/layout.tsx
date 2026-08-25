import type { Metadata } from 'next';
import '../src/style.css';

export const metadata: Metadata = {
  title: 'Stage Timer',
  description: 'A professional stage timer application',
  manifest: '/manifest.json',
  icons: {
    icon: '/Timer--Streamline-Radix.svg?v=85',
    apple: '/icon-192.png?v=85',
  },
};

const versionScript = `
  try {
    if ('localStorage' in window) {
      var currentVersion = 'v85';
      var storedVersion = localStorage.getItem('appVersion');
      if (storedVersion !== currentVersion) {
        localStorage.setItem('appVersion', currentVersion);
        if ('caches' in window) {
          caches.keys().then(function (names) {
            for (var i = 0; i < names.length; i++) {
              if (names[i].indexOf('stage-timer-') === 0) caches.delete(names[i]);
            }
          });
        }
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function (registrations) {
            var appScope = new URL('./', window.location.href).href;
            for (var i = 0; i < registrations.length; i++) {
              if (registrations[i].scope === appScope) registrations[i].unregister();
            }
          });
        }
      }
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#141414" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: versionScript }} />
        {children}
      </body>
    </html>
  );
}
