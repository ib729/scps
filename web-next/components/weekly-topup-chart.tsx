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
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import type { WeeklyTopupData } from "@/lib/repositories/transactions"
import { toDisplayValue } from "@/lib/currency"

interface WeeklyTopupChartProps {
  data: WeeklyTopupData[]
}

const chartConfig = {
  amount: {
    label: "Top-up Amount",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export function WeeklyTopupChart({ data }: WeeklyTopupChartProps) {
  const total = React.useMemo(
    () => toDisplayValue(data.reduce((acc, curr) => acc + curr.amount, 0)),
    [data]
  )

  // Calculate trend (comparing first half vs second half of data)
  const { trend, trendDirection } = React.useMemo(() => {
    if (data.length === 0) {
      return { trend: "0.0", trendDirection: "up" as const }
    }
    
    const midpoint = Math.floor(data.length / 2)
    if (midpoint === 0) {
      return { trend: "0.0", trendDirection: "up" as const }
    }
    
    const firstHalfAvg = toDisplayValue(data.slice(0, midpoint).reduce((acc, curr) => acc + curr.amount, 0)) / midpoint
    const secondHalfAvg = toDisplayValue(data.slice(midpoint).reduce((acc, curr) => acc + curr.amount, 0)) / (data.length - midpoint)
    const trendValue = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1) : "0.0"
    const direction = parseFloat(trendValue) >= 0 ? "up" as const : "down" as const
    
    return { trend: trendValue, trendDirection: direction }
  }, [data])

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-6">
          <CardTitle>Weekly Top-up Trends</CardTitle>
          <CardDescription>
            Showing total top-up amounts per week
          </CardDescription>
        </div>
        <div className="flex">
          <div className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
            <span className="text-muted-foreground text-xs">
              Total Top-ups
            </span>
            <span className="text-lg leading-none font-bold sm:text-3xl">
              ¥{total.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Trending {trendDirection} by {Math.abs(parseFloat(trend))}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground">
            <p>No top-up data available for the selected period</p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{
                left: 12,
                right: 12,
                top: 12,
              }}
            >
              <defs>
                <linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-amount)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-amount)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `¥${toDisplayValue(value).toFixed(1)}`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[150px]"
                    nameKey="amount"
                    labelFormatter={(value) => {
                      return `Week of ${value}`
                    }}
                    formatter={(value) => {
                      return `¥${toDisplayValue(Number(value)).toFixed(1)}`
                    }}
                  />
                }
              />
              <Area
                dataKey="amount"
                type="natural"
                fill="url(#fillAmount)"
                fillOpacity={0.4}
                stroke="var(--color-amount)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

