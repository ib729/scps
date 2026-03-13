"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DashboardChartDataPoint } from "@/lib/repositories/transactions"
import { toDisplayValue } from "@/lib/currency"

interface DashboardActivityChartProps {
  data: DashboardChartDataPoint[]
}

const chartConfig = {
  topups: {
    label: "Top-ups",
    theme: {
      light: "oklch(0.58 0.16 156)",
      dark: "oklch(0.72 0.16 156)",
    },
  },
} satisfies ChartConfig

type TimeRange = "90d" | "30d" | "7d"

export function DashboardActivityChart({ data }: DashboardActivityChartProps) {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("90d")

  const filteredData = React.useMemo(() => {
    if (data.length === 0) {
      return []
    }

    const referenceDate = new Date(`${data[data.length - 1]!.date}T00:00:00`)
    const daysToSubtract = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90
    const startDate = new Date(referenceDate)
    startDate.setDate(referenceDate.getDate() - (daysToSubtract - 1))

    return data.filter((item) => new Date(`${item.date}T00:00:00`) >= startDate)
  }, [data, timeRange])

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Top-up Trends</CardTitle>
          <CardDescription>
            Showing top-up activity across the selected time range
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select a time range"
          >
            <SelectValue placeholder="Last 90 days" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Last 90 days
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {filteredData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-muted-foreground">
            <p>No transaction data available for the selected period</p>
          </div>
        ) : (
          <ChartContainer
            id="dashboard-activity-chart"
            config={chartConfig}
            className="aspect-auto h-[280px] w-full"
          >
            <AreaChart data={filteredData} margin={{ left: 12, right: 12, top: 12 }}>
              <defs>
                <linearGradient id="fillTopups" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-topups)"
                    stopOpacity={0.7}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-topups)"
                    stopOpacity={0.08}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(`${value}T00:00:00`)
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `¥${toDisplayValue(Number(value)).toFixed(0)}`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }}
                    formatter={(value) => {
                      return (
                        <>
                          <span>Top-ups</span>
                          <span>¥{toDisplayValue(Number(value)).toFixed(2)}</span>
                        </>
                      )
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="topups"
                type="natural"
                fill="url(#fillTopups)"
                stroke="var(--color-topups)"
                strokeWidth={2.5}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
