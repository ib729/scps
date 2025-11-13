import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://scps.ivanbelousov.com'),
  title: {
    default: 'Student Council Payment System (SCPS)',
    template: '%s | SCPS'
  },
  description: 'Secure NFC-enabled payment system for student snack bar purchases. Manage student accounts, cards, and transactions efficiently.',
  keywords: ['student payment system', 'NFC payment', 'school snack bar', 'student accounts'],
  authors: [{ name: 'Ivan Belousov' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://scps.ivanbelousov.com',
    title: 'Student Council Payment System (SCPS)',
    description: 'Secure NFC-enabled payment system for student snack bar purchases',
    siteName: 'SCPS',
  },
  twitter: {
    card: 'summary',
    title: 'Student Council Payment System (SCPS)',
    description: 'Secure NFC-enabled payment system for student snack bar purchases',
  },
  robots: {
    index: false, // Don't index authenticated app pages by default
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{let t=localStorage.getItem('theme'),d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&!t&&d)){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light')}else if(t==='light'){document.documentElement.classList.add('light');document.documentElement.classList.remove('dark')}else{document.documentElement.classList.remove('dark','light')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
