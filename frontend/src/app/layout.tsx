import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Form Corrector",
  description: "Real-time workout form analysis and coaching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
