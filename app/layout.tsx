import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BNIX Webmail",
  description: "BNIX DirectAdmin webmail client",
  icons: {
    icon: "/brand/bnix-favicon.png",
    shortcut: "/brand/bnix-favicon.png",
    apple: "/brand/bnix-favicon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
