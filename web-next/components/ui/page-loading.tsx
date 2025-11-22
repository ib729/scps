"use client"

import { Progress } from "@/components/ui/progress"
import { useEffect, useState } from "react"

export function PageLoading() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Indeterminate animation - cycles from 0 to 100 continuously
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0
        }
        return prev + 2
      })
    }, 50)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <Progress value={progress} className="h-1" />
      </div>
    </div>
  )
}

