import type { Metadata } from "next";
import "./globals.css";
import { PreferenceBootstrap } from "./components/PreferenceBootstrap";

export const metadata: Metadata = {
  title: "Keybox - Password Manager",
  description: "Secure, encrypted offline password manager.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#090c13" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme') || 'system';
                if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <PreferenceBootstrap />
        {children}
      </body>
    </html>
  );
}
