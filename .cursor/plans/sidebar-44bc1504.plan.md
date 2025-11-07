<!-- 44bc1504-15a1-4ffe-941b-ad2e20b5834c a2e3a795-514f-4c2f-9063-b781b4618043 -->
# Sidebar & POS Enhancements Plan

1. Add a `ThemeProvider` wrapper (new `components/theme-provider.tsx`) and wrap `app/layout.tsx` so `next-themes` drives the upcoming theme toggle.
2. Update `components/app-sidebar.tsx` footer to match shadcn `sidebar-07`: display avatar/name/email plus an expandable action list (“Account”, theme toggle, “Log out”) using existing sidebar primitives.
3. Extend `components/tap-alert.tsx` so unregistered taps open a drawer containing an inline enrollment form (option 1.b) powered by the existing card creation server action.
4. In `app/pos/pos-form.tsx`, trigger a centered dialog (using `@/components/ui/dialog`) when Tap mode captures a card: prefill amount input, keep the current form, and submit via the existing flow after confirmation.