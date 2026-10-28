import type { Metadata, Viewport } from "next";
import { Geist, Syne } from "next/font/google";
import "./globals.css";

const bodyFont = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://halenn.com"),
  title: {
    default: "Halenn | Websites & Connected Systems",
    template: "%s | Halenn",
  },
  description:
    "Halenn designs and builds websites, webshops and n8n workflows, with ongoing care after launch. A company by Aevell.",
  icons: {
    icon: [
      { url: "/brand/halenn-ribbon-favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { url: "/brand/halenn-ribbon-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/halenn-ribbon-icon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: { url: "/brand/halenn-ribbon-icon-180.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: {
    title: "Halenn | Websites & Connected Systems",
    description:
      "Websites, commerce and automation. Designed together, supported after launch.",
    url: "https://halenn.com",
    siteName: "Halenn",
    type: "website",
    images: [{ url: "/brand/halenn-ribbon-v1.png", width: 1536, height: 1024, alt: "Halenn silver ribbon logo" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050607",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
