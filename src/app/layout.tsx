import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dragon Force Ops",
  description: "Aplicacion interna de operaciones de FC Porto Dragon Force Monterrey"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
