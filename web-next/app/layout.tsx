import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme-bootstrap";

export const metadata: Metadata = {
  metadataBase: new URL('https://scps.ivanbelousov.com'),
  title: {
    default: 'Student Council Payment System (SCPS)',
    template: '%s | SCPS'
  },
  description: 'Secure NFC-enabled payment system for school snack bar purchases. Manage customer accounts, cards, and transactions efficiently.',
  keywords: ['school payment system', 'NFC payment', 'school snack bar', 'customer accounts'],
  authors: [{ name: 'Ivan Belousov' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://scps.ivanbelousov.com',
    title: 'Student Council Payment System (SCPS)',
    description: 'Secure NFC-enabled payment system for school snack bar purchases',
    siteName: 'SCPS',
  },
  twitter: {
    card: 'summary',
    title: 'Student Council Payment System (SCPS)',
    description: 'Secure NFC-enabled payment system for school snack bar purchases',
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
            __html: THEME_BOOTSTRAP_SCRIPT,
          }}
        />
      </head>
      <body
        className="antialiased"
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
