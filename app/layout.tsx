import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <meta name="theme-color" content="#090c13" />
      </head>
      <body>{children}</body>
    </html>
  );
}
