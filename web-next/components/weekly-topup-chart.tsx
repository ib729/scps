"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
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
    () => data.reduce((acc, curr) => acc + curr.amount, 0),
    [data]
  )

  // Calculate trend (comparing first half vs second half of data)
  const midpoint = Math.floor(data.length / 2)
  const firstHalfAvg = data.slice(0, midpoint).reduce((acc, curr) => acc + curr.amount, 0) / midpoint
  const secondHalfAvg = data.slice(midpoint).reduce((acc, curr) => acc + curr.amount, 0) / (data.length - midpoint)
  const trend = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1) : "0.0"
  const trendDirection = parseFloat(trend) >= 0 ? "up" : "down"

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
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
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
                    return `¥${Number(value).toLocaleString()}`
                  }}
                />
              }
            />
            <Bar 
              dataKey="amount" 
              fill="var(--color-amount)" 
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

