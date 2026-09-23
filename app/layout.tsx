import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import '../src/style.css';

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Stage Timer',
  description: 'A professional stage timer application',
  manifest: '/manifest.json',
  icons: {
    icon: '/Timer--Streamline-Radix.svg?v=86',
    apple: '/icon-192.png?v=86',
  },
};

const versionScript = `
  try {
    if ('localStorage' in window) {
      var currentVersion = 'v86';
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
      </head>
      <body className={jetBrainsMono.variable}>
        <script dangerouslySetInnerHTML={{ __html: versionScript }} />
        {children}
      </body>
    </html>
  );
}
