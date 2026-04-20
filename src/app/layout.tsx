import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commission Computer",
  description: "Configurez vos plans de commission, suivez vos gains, à la Qobra.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
