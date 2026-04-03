import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Song Database",
  description: "Choir song repertoire manager"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] min-h-screen">
        {children}
      </body>
    </html>
  );
}
