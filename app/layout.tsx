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
    default: "Halenn | Websites, commerce & connected systems",
    template: "%s | Halenn",
  },
  description:
    "Halenn designs and builds websites, webshops and n8n workflows, with ongoing care after launch. A company by Aevell.",
  icons: { icon: "/prototypes/halenn-original.png", apple: "/prototypes/halenn-original.png" },
  openGraph: {
    title: "Halenn | Websites, commerce & connected systems",
    description:
      "Websites, commerce and automation — designed together, supported after launch.",
    url: "https://halenn.com",
    siteName: "Halenn",
    type: "website",
    images: [{ url: "/prototypes/halenn-original.png", width: 1774, height: 887, alt: "Halenn" }],
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
