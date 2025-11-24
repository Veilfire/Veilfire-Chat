import "./globals.css";
import type { Metadata } from "next";
import NextAuthSessionProvider from "./providers";

export const metadata: Metadata = {
  title: "Veilfire Chat",
  description: "Simple LLM chat app with OpenRouter, MongoDB & NextAuth",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}
