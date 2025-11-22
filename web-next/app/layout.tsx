import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read theme from cookie for server-side rendering
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  
  // Apply theme class server-side if cookie exists (not 'system')
  const themeClass = themeCookie && themeCookie !== 'system' ? themeCookie : undefined;
  const colorScheme = themeClass === 'dark' ? 'dark' : themeClass === 'light' ? 'light' : undefined;
  
  return (
    <html 
      lang="en" 
      suppressHydrationWarning
      className={themeClass}
      style={colorScheme ? { colorScheme } : undefined}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){try{var t=localStorage.getItem('theme');if(t&&t!=='system'){document.documentElement.className=t;document.documentElement.style.colorScheme=t}}catch(e){}}()`,
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
