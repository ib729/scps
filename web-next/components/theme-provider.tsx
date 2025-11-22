"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"

function ThemeSyncWrapper({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  
  // Sync theme to cookie whenever it changes
  React.useEffect(() => {
    if (theme) {
      document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Strict`
    }
  }, [theme])
  
  return <>{children}</>
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider 
      {...props}
      enableColorScheme
    >
      <ThemeSyncWrapper>
        {children}
      </ThemeSyncWrapper>
    </NextThemesProvider>
  )
}

