import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { acentoPanel, nombrePanel } from "@/lib/panel";
import "./globals.css";

const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export function generateMetadata(): Metadata {
  return { title: nombrePanel(), description: "Calendario, estado y archivos de la red de canales." };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
      style={{ "--acento": acentoPanel() } as React.CSSProperties}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
