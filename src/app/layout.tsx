import type { Metadata } from "next";
import { Aoboshi_One } from "next/font/google";
import "./globals.css";

const aoboshi = Aoboshi_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-aoboshi",
  display: "swap"
});

export const metadata: Metadata = {
  title: "INVICTA",
  description: "Aplicacion interna de operaciones de FC Porto Dragon Force Monterrey"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={aoboshi.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
