import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "level max rule",
  description: "choir songs data crap idk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
      <div className="wrapper">
          <div className="el" />
          {children}
        </div>
      </body>
    </html>
  );
}
