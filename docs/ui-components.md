# UI Components Guide

Documentation for custom UI components, animations, and design patterns used in the Stuco web interface.

## Overview

The Stuco web UI uses a combination of:
- **Shadcn UI**: Pre-built, accessible components based on Radix UI
- **Custom Components**: Purpose-built for Stuco functionality
- **Animation Libraries**: Motion (Framer Motion) and animate-ui
- **Charting**: Recharts for data visualization
- **Theming**: next-themes for dark mode support

## Component Library

### Shadcn UI Components

All Shadcn components are in `web-next/components/ui/`. These follow a consistent design system with:
- Neutral color palette (no gradients)
- Tailwind CSS 4 styling
- Full accessibility (ARIA labels, keyboard navigation)
- TypeScript types

**Available Components:**
- `button.tsx` - Primary, secondary, destructive variants
- `card.tsx` - Container with header, content, footer
- `dialog.tsx` - Modal dialogs with backdrop
- `drawer.tsx` - Side drawer for mobile
- `sheet.tsx` - Sliding panel
- `table.tsx` - Data tables with sorting
- `form.tsx` - Form fields with React Hook Form integration
- `input.tsx`, `select.tsx`, `textarea.tsx` - Form inputs
- `alert.tsx`, `alert-dialog.tsx` - Notifications and confirmations
- `badge.tsx` - Status indicators
- `avatar.tsx` - User avatars
- `tooltip.tsx` - Hover tooltips
- `dropdown-menu.tsx` - Context menus
- `tabs.tsx` - Tabbed interfaces
- `skeleton.tsx` - Loading placeholders
- `separator.tsx` - Dividers
- `collapsible.tsx` - Expandable sections

**Usage Example:**

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <p>¥50.00</p>
        <Button>Top Up</Button>
      </CardContent>
    </Card>
  );
}
```

## Custom Components

### TapAlert Component

**Location**: `web-next/components/tap-alert.tsx`

Global component that shows toasts when NFC cards are tapped outside the POS page.

**Features:**
- Real-time SSE connection to tap stream
- Toast notifications with Sonner
- "Go to POS" action button
- Auto-navigation with student pre-selection
- 10-second auto-dismiss

**Usage:**
Included in root layout automatically:

```typescript
// app/layout.tsx
import TapAlert from '@/components/tap-alert';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <TapAlert />
      </body>
    </html>
  );
}
```

### POS Form

**Location**: `web-next/app/pos/pos-form.tsx`

Main point-of-sale interface with NFC integration.

**Features:**
- Tap Card vs Manual mode toggle
- Real-time card tap detection via SSE
- Student auto-selection from card UID
- Balance display with overdraft indicator
- Amount input with currency formatting
- Description and staff name fields
- Transaction processing with validation
- Success/error feedback

**Props:**
- `students`: Array of all students with accounts
- Initial mode from URL params (e.g., `?mode=tap&uid=ABC123`)

### Top-up Form

**Location**: `web-next/app/topup/topup-form.tsx`

Manual or tap-based balance adjustment interface.

**Features:**
- Student selection (manual or from NFC tap)
- Amount input (positive for top-up, negative for adjustment)
- Description field (required for adjustments)
- Staff name tracking
- Balance preview

### Weekly Top-up Chart

**Location**: `web-next/components/weekly-topup-chart.tsx`

Recharts-based visualization of weekly top-up trends.

**Features:**
- Line chart of top-ups over time
- Responsive design
- Tooltip with formatted currency
- Configurable time range

**Usage:**

```typescript
import WeeklyTopupChart from '@/components/weekly-topup-chart';

export default function Dashboard() {
  const data = [
    { week: '2025-W01', amount: 1500 },
    { week: '2025-W02', amount: 1800 },
    // ...
  ];

  return <WeeklyTopupChart data={data} />;
}
```

### App Sidebar

**Location**: `web-next/components/app-sidebar.tsx`

Navigation sidebar with collapsible sections.

**Features:**
- Collapsible on mobile
- Active route highlighting
- Icon navigation
- User profile section (for future auth)
- Responsive design

## Animation Components

### FlipWords

**Location**: `web-next/components/ui/flip-words.tsx`

Animated text that cycles through words with flip effect.

**Features:**
- Smooth letter-by-letter animation
- Configurable duration
- Spring physics for natural motion
- Blur effect on transition

**Usage:**

```typescript
import { FlipWords } from '@/components/ui/flip-words';

export default function Hero() {
  const words = ['Snacks', 'Drinks', 'Treats'];

  return (
    <div>
      Buy your <FlipWords words={words} duration={3000} /> here!
    </div>
  );
}
```

### EncryptedText

**Location**: `web-next/components/ui/encrypted-text.tsx`

Text that reveals with a decryption effect.

**Features:**
- Character-by-character reveal
- Scrambled characters before reveal
- Customizable charset
- Viewport-triggered animation (appears when scrolled into view)
- Configurable reveal speed

**Usage:**

```typescript
import { EncryptedText } from '@/components/ui/encrypted-text';

export default function Section() {
  return (
    <h1>
      <EncryptedText 
        text="Welcome to Stuco"
        revealDelayMs={50}
      />
    </h1>
  );
}
```

**Props:**
- `text` (required): Text to animate
- `revealDelayMs` (default: 50): Delay between character reveals
- `charset` (default: alphanumeric): Characters for scrambling
- `className`: Additional CSS classes

## Background Components

Located in `web-next/components/animate-ui/components/backgrounds/`.

### HoleBackground

**Location**: `backgrounds/hole.tsx`

3D particle effect with a central gravitational hole.

**Features:**
- Three.js-based 3D rendering
- Animated particle system
- Rotating lines and discs
- Configurable colors and density
- Performance-optimized

**Usage:**

```typescript
import HoleBackground from '@/components/animate-ui/components/backgrounds/hole';

export default function HeroSection() {
  return (
    <HoleBackground 
      strokeColor="#737373"
      numberOfLines={50}
      numberOfDiscs={50}
      particleRGBColor={[255, 255, 255]}
      className="absolute inset-0 z-0"
    >
      <div className="relative z-10">
        <h1>Welcome</h1>
      </div>
    </HoleBackground>
  );
}
```

### Fireworks

**Location**: `backgrounds/fireworks.tsx`

Canvas-based fireworks particle effect.

**Features:**
- Burst patterns
- Fade-out animation
- Color variation
- Click-triggered explosions

### GravityStars

**Location**: `backgrounds/gravity-stars.tsx`

Starfield with gravity simulation.

**Features:**
- Mouse interaction (stars attracted to cursor)
- Parallax effect
- Twinkling animation
- Configurable star count

**Usage Recommendation**: Use sparingly for hero sections or special pages. Can impact performance on low-end devices.

## Theming

### Dark Mode

**Provider**: `next-themes` via `web-next/components/theme-provider.tsx`

**Configuration:**

```typescript
// app/layout.tsx
import { ThemeProvider } from '@/components/theme-provider';

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Usage in Components:**

```typescript
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Toggle Theme
    </button>
  );
}
```

**Theme Variables:**

Defined in `web-next/app/globals.css`:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1 0 0);
  --primary: oklch(0.4 0.15 250);
  /* ... */
}

.dark {
  --background: oklch(0.1 0 0);
  --foreground: oklch(0.9 0 0);
  /* ... */
}
```

## Chart Components

### Recharts Integration

**Library**: Recharts (wrapper around D3)

**Common Charts:**
- Line charts (trends over time)
- Bar charts (comparisons)
- Pie charts (distribution)

**Example:**

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function TransactionChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => `¥${(value / 10).toFixed(1)}`} />
        <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Best Practices:**
- Always use `ResponsiveContainer` for mobile support
- Format currency in tooltips (convert from tenths)
- Use theme colors via CSS variables
- Add loading state while data fetches

## Form Components

### React Hook Form + Zod

All forms use React Hook Form with Zod validation.

**Pattern:**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const schema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
});

export default function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, description: '' },
  });

  const onSubmit = async (data) => {
    // Handle submission
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="number" step="0.1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

## Accessibility

All components follow WCAG 2.1 AA standards:

- **Keyboard Navigation**: All interactive elements are keyboard-accessible
- **ARIA Labels**: Screen reader support via proper ARIA attributes
- **Focus Management**: Visible focus indicators, logical tab order
- **Color Contrast**: Meets 4.5:1 ratio for text
- **Semantic HTML**: Proper heading hierarchy, landmarks

**Testing:**
```bash
# Run accessibility audit
pnpm build
# Use Chrome DevTools Lighthouse accessibility audit
```

## Performance

### Code Splitting

Use dynamic imports for heavy components:

```typescript
import dynamic from 'next/dynamic';

const HoleBackground = dynamic(
  () => import('@/components/animate-ui/components/backgrounds/hole'),
  { ssr: false }
);
```

### Memoization

Use `React.memo` for expensive renders:

```typescript
import { memo } from 'react';

const ExpensiveComponent = memo(function ExpensiveComponent({ data }) {
  // Heavy computation
  return <div>{/* render */}</div>;
});
```

## Component Checklist

When creating new components:

- [ ] TypeScript types defined
- [ ] Props documented with JSDoc comments
- [ ] Accessibility attributes included (ARIA)
- [ ] Responsive design (mobile-first)
- [ ] Error boundaries for runtime errors
- [ ] Loading states for async operations
- [ ] Keyboard navigation tested
- [ ] Dark mode styles verified
- [ ] Performance profiled (React DevTools)

## Resources

- [Shadcn UI Documentation](https://ui.shadcn.com)
- [Radix UI Primitives](https://www.radix-ui.com)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Recharts Documentation](https://recharts.org)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)

**Updated**: November 2025

