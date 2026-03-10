"use client";

import * as React from "react";
import type { HTMLAttributes } from "react";

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CartIcon,
  CheckIcon as AnimatedCheckIcon,
  ChevronsUpDownIcon,
  ChevronDownIcon as AnimatedChevronDownIcon,
  ChevronRightIcon as AnimatedChevronRightIcon,
  ChevronUpIcon as AnimatedChevronUpIcon,
  CopyIcon,
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  GripHorizontalIcon,
  HandCoinsIcon,
  JapaneseYenIcon,
  LayoutPanelTopIcon,
  LogoutIcon,
  MoonIcon,
  PanelLeftOpenIcon,
  RotateCwIcon,
  SettingsIcon,
  SunIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  XIcon as AnimatedXIcon,
} from "lucide-animated";
import {
  Circle as LucideCircle,
  Dot as LucideDot,
  Minus as LucideMinus,
} from "lucide-react";

import { cn } from "@/lib/utils";

type AnimatedIconComponent = React.ComponentType<any>;

export type AnimatedIconHandle = {
  startAnimation?: () => void;
  stopAnimation?: () => void;
};

type IconProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
};

function wrapAnimatedIcon(Component: AnimatedIconComponent, defaultSize = 16) {
  const WrappedIcon = React.forwardRef<AnimatedIconHandle, IconProps>(
    ({ className, size = defaultSize, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, ...props }, ref) => {
      const AnimatedComponent = Component as React.ComponentType<any>;

      return (
        <AnimatedComponent
          ref={ref}
          size={size}
          className={cn(
            "inline-flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-full [&_svg]:w-full",
            className,
          )}
          {...props}
        />
      );
    },
  );

  WrappedIcon.displayName = `Wrapped${Component.displayName || Component.name || "Icon"}`;

  return WrappedIcon;
}

function wrapLucideFallback(Component: React.ComponentType<any>) {
  const WrappedIcon = React.forwardRef<SVGSVGElement, IconProps>(
    ({ className, size = 16, strokeWidth, absoluteStrokeWidth, ...props }, ref) => {
      return (
        <Component
          ref={ref}
          size={size}
          strokeWidth={strokeWidth}
          absoluteStrokeWidth={absoluteStrokeWidth}
          className={cn("h-4 w-4 shrink-0", className)}
          {...props}
        />
      );
    },
  );

  WrappedIcon.displayName = `WrappedFallback${Component.displayName || Component.name || "Icon"}`;

  return WrappedIcon;
}

export const LayoutDashboard = wrapAnimatedIcon(LayoutPanelTopIcon);
export const Users = wrapAnimatedIcon(UsersIcon);
export const Receipt = wrapAnimatedIcon(FileTextIcon);
export const ShoppingCart = wrapAnimatedIcon(CartIcon);
export const TrendingUp = wrapAnimatedIcon(TrendingUpIcon);
export const Settings = wrapAnimatedIcon(SettingsIcon);
export const ChevronsUpDown = wrapAnimatedIcon(ChevronsUpDownIcon);
export const LogOut = wrapAnimatedIcon(LogoutIcon);
export const User = wrapAnimatedIcon(UserIcon);
export const Moon = wrapAnimatedIcon(MoonIcon);
export const Sun = wrapAnimatedIcon(SunIcon);
export const Eye = wrapAnimatedIcon(EyeIcon);
export const EyeOff = wrapAnimatedIcon(EyeOffIcon);
export const RotateCw = wrapAnimatedIcon(RotateCwIcon);
export const DatabaseBackup = wrapAnimatedIcon(DatabaseIcon);
export const Copy = wrapAnimatedIcon(CopyIcon);
export const Check = wrapAnimatedIcon(AnimatedCheckIcon);
export const ArrowUpDown = wrapAnimatedIcon(ChevronsUpDownIcon);
export const ArrowUpRight = wrapAnimatedIcon(ArrowUpRightIcon);
export const ArrowDownRight = wrapAnimatedIcon(ArrowDownRightIcon);
export const Minus = wrapLucideFallback(LucideMinus);
export const Landmark = wrapAnimatedIcon(JapaneseYenIcon);
export const HandCoins = wrapAnimatedIcon(HandCoinsIcon);
export const CheckIcon = wrapAnimatedIcon(AnimatedCheckIcon);
export const ChevronDownIcon = wrapAnimatedIcon(AnimatedChevronDownIcon);
export const ChevronUpIcon = wrapAnimatedIcon(AnimatedChevronUpIcon);
export const ChevronRightIcon = wrapAnimatedIcon(AnimatedChevronRightIcon);
export const ChevronRight = wrapAnimatedIcon(AnimatedChevronRightIcon);
export const MoreHorizontal = wrapAnimatedIcon(GripHorizontalIcon);
export const CircleIcon = wrapLucideFallback(LucideCircle);
export const Dot = wrapLucideFallback(LucideDot);
export const PanelLeftIcon = wrapAnimatedIcon(PanelLeftOpenIcon);
export const XIcon = wrapAnimatedIcon(AnimatedXIcon);
