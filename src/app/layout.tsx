import type { Metadata } from "next";
import { Aoboshi_One } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
    <html lang="es" className={aoboshi.variable} suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply saved theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`
          }}
        />
      </head>
      <body className="min-h-screen">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
