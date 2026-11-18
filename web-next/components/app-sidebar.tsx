"use client"

import Image from "next/image"
import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { updateCurrentUserPreferencesAction } from "@/app/actions/user-preferences"
import { updateSchoolSettingsAction } from "@/app/actions/school-settings"
import {
  LayoutDashboard,
  Users,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Settings,
  ChevronsUpDown,
  LogOut,
  User,
  UserCog,
  Moon,
  Sun,
  Eye,
  EyeOff,
  RotateCw,
  DatabaseBackup,
} from "@/lib/icons"
import { useTheme } from "next-themes"
import { useNFCReader } from "@/lib/nfc-reader-context"
import {
  type PosDefaultMode,
  type NFCReader,
} from "@/lib/pos-preferences"
import type { UserPreferences } from "@/lib/models"
import type { AuthenticatedUser } from "@/lib/auth-session"
import type { SchoolSettings } from "@/lib/school-settings"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ScpsUpdateSettings } from "@/components/scps-update-settings"

// Navigation items
const navItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Customers",
    url: "/admin/customers",
    icon: Users,
  },
  {
    title: "Transactions",
    url: "/admin/transactions",
    icon: Receipt,
  },
  {
    title: "POS",
    url: "/admin/pos",
    icon: ShoppingCart,
  },
  {
    title: "Top-up",
    url: "/admin/topup",
    icon: TrendingUp,
  },
]

const BRAND_LOGO_SOURCES = [
  "/school-logo.webp",
  "/school-logo.png",
  "/school-logo.jpg",
  "/school-logo.jpeg",
] as const

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: AuthenticatedUser
  initialPreferences: UserPreferences
  initialSchoolSettings: SchoolSettings
}

const settingsDialogClassName = "max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-[900px]"

export function AppSidebar({ user: initialUser, initialPreferences, initialSchoolSettings, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [brandLogoIndex, setBrandLogoIndex] = React.useState(0)
  const schoolSettings = initialSchoolSettings
  const [draftSchoolSettings, setDraftSchoolSettings] = React.useState(initialSchoolSettings)
  const [savingSchool, setSavingSchool] = React.useState(false)
  const [readingLogo, setReadingLogo] = React.useState(false)
  const { setTheme, resolvedTheme } = useTheme()
  const { selectedReader, setSelectedReader } = useNFCReader()
  const [mounted, setMounted] = React.useState(false)
  const [showAccountDialog, setShowAccountDialog] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [savingSettings, setSavingSettings] = React.useState(false)
  const [deletePassword, setDeletePassword] = React.useState("")
  const [localSelectedReader, setLocalSelectedReader] =
    React.useState<NFCReader>(initialPreferences.selected_reader)
  const [localDefaultPosMode, setLocalDefaultPosMode] =
    React.useState<PosDefaultMode>(initialPreferences.pos_default_mode)
  const [restartingServices, setRestartingServices] = React.useState(false)
  const [downloadingBackup, setDownloadingBackup] = React.useState(false)

  // Use server-provided user data as the primary source
  // Removed useSession to prevent automatic polling that causes page refreshes every 30 seconds
  // Server-side auth in layout.tsx handles session validation, so client-side polling is unnecessary
  const user = initialUser

  // Form state for profile
  const [formData, setFormData] = React.useState({
    name: "",
    email: "",
    image: "",
  })

  // Form state for password
  const [passwordData, setPasswordData] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false)
  const [showNewPassword, setShowNewPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const brandLogoSources = schoolSettings.logo ? [schoolSettings.logo, ...BRAND_LOGO_SOURCES] : BRAND_LOGO_SOURCES
  const brandLogoSrc = brandLogoSources[brandLogoIndex] ?? null

  // Update local state when context changes
  React.useEffect(() => {
    setLocalSelectedReader(selectedReader)
  }, [selectedReader])

  React.useEffect(() => {
    setLocalSelectedReader(initialPreferences.selected_reader)
    setLocalDefaultPosMode(initialPreferences.pos_default_mode)
  }, [initialPreferences.pos_default_mode, initialPreferences.selected_reader])

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 512 * 1024) {
      toast.error("Choose a PNG, JPEG, or WebP image up to 512 KB")
      return
    }
    setReadingLogo(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new window.Image()
      image.src = url
      await image.decode()
      const { promise, resolve, reject } = Promise.withResolvers<string>()
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject()
      reader.onerror = () => reject()
      reader.readAsDataURL(file)
      const logo = await promise
      setDraftSchoolSettings((current) => ({ ...current, logo }))
    } catch {
      toast.error("Could not read that image")
    } finally {
      URL.revokeObjectURL(url)
      setReadingLogo(false)
    }
  }

  const handleSaveSchool = async () => {
    setSavingSchool(true)
    try {
      const result = await updateSchoolSettingsAction(draftSchoolSettings)
      if (!result.success || !result.data) {
        toast.error(result.error || "Failed to save school details")
        return
      }
      setDraftSchoolSettings(result.data)
      setBrandLogoIndex(0)
      router.refresh()
      toast.success("School details saved")
    } catch {
      toast.error("Failed to save school details")
    } finally {
      setSavingSchool(false)
    }
  }

  // Handle saving settings
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const result = await updateCurrentUserPreferencesAction({
        selectedReader: localSelectedReader,
        posDefaultMode: localDefaultPosMode,
      })

      if (!result.success || !result.data) {
        toast.error(result.error || "Failed to save settings")
        return
      }

      setSelectedReader(result.data.selected_reader)
      setLocalSelectedReader(result.data.selected_reader)
      setLocalDefaultPosMode(result.data.pos_default_mode)
      setShowSettingsDialog(false)
      router.refresh()
      toast.success("Settings saved successfully")
    } catch (error) {
      toast.error("Failed to save settings")
    } finally {
      setSavingSettings(false)
    }
  }

  // Handle restarting NFC services
  const handleRestartServices = async () => {
    setRestartingServices(true)
    try {
      const response = await fetch("/api/system/restart-services", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        toast.error(data.error || "Failed to restart services")
        return
      }

      toast.success("NFC services restarted successfully")
    } catch (error) {
      toast.error("An error occurred while restarting services")
      console.error("Error restarting services:", error)
    } finally {
      setRestartingServices(false)
    }
  }

  // Password strength calculation
  const calculatePasswordStrength = (password: string): { strength: string; color: string } => {
    if (!password) return { strength: "", color: "" }

    let score = 0

    // Length check
    if (password.length >= 8) score++
    if (password.length >= 12) score++

    // Character variety checks
    if (/[a-z]/.test(password)) score++  // lowercase
    if (/[A-Z]/.test(password)) score++  // uppercase
    if (/[0-9]/.test(password)) score++  // numbers
    if (/[^a-zA-Z0-9]/.test(password)) score++  // special chars

    // Determine strength level
    if (score <= 2) return { strength: "Weak", color: "text-red-600" }
    if (score <= 4) return { strength: "Medium", color: "text-orange-600" }
    return { strength: "Strong", color: "text-green-600" }
  }

  const passwordStrength = calculatePasswordStrength(passwordData.newPassword)

  // Wait until mounted to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Sync form data when dialog opens
  React.useEffect(() => {
    if (showAccountDialog && user) {
      setFormData({
        name: user.name,
        email: user.email,
        image: user.image || "",
      })
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    }
  }, [showAccountDialog, user])

  // Reset delete password when dialog closes
  React.useEffect(() => {
    if (!showDeleteDialog) {
      setDeletePassword("")
    }
  }, [showDeleteDialog])

  const handleToggleTheme = () => {
    if (!mounted) return
    const newTheme = resolvedTheme === "dark" ? "light" : "dark"
    setTheme(newTheme)
    // Sync to cookie immediately for server-side rendering
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000; SameSite=Strict`
  }

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }))
  }

  const isNavItemActive = React.useCallback(
    (url: string) => {
      if (url === "/admin") {
        return pathname === "/admin"
      }

      return pathname === url || pathname?.startsWith(`${url}/`)
    },
    [pathname]
  )

  const handleSaveProfile = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data, error } = await authClient.updateUser({
        name: formData.name,
        image: formData.image || null,
      })

      if (error) {
        toast.error(error.message || "Failed to update profile")
      } else {
        setShowAccountDialog(false)
        toast.success("Profile updated successfully!")
      }
    } catch (error) {
      toast.error("An error occurred while updating profile")
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user) return

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match")
      return
    }

    if (passwordData.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await authClient.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        revokeOtherSessions: false,
      })

      if (error) {
        toast.error(error.message || "Failed to update password")
      } else {
        setShowAccountDialog(false)
        toast.success("Password updated successfully!")
      }
    } catch (error) {
      toast.error("An error occurred while updating password")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      await authClient.signOut()
      router.push("/login")
    } catch (error) {
      toast.error("Failed to sign out")
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error("Please enter your password to confirm")
      return
    }

    setLoading(true)
    try {
      const { data, error } = await authClient.deleteUser({
        password: deletePassword,
      })

      if (error) {
        toast.error(error.message || "Failed to delete account")
      } else {
        toast.success("Account deleted successfully")
        setShowDeleteDialog(false)
        setShowAccountDialog(false)
        // Sign out and redirect to login
        await authClient.signOut()
        router.push("/login")
      }
    } catch (error) {
      toast.error("An error occurred while deleting account")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-1 md:pt-3 lg:pt-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:-translate-x-1 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0!"
            >
              <Link href="/">
                <div className="flex flex-1 items-center gap-3 group-data-[collapsible=icon]:justify-center">
                  <div className="grid min-w-0 flex-1 text-left text-lg leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold tracking-tight">Student Council</span>
                    <span className="truncate text-base text-sidebar-foreground/70">{schoolSettings.schoolYear}</span>
                  </div>
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border/70 bg-sidebar-accent/40 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9">
                    {brandLogoSrc ? (
                      <Image
                        key={brandLogoSrc}
                        src={brandLogoSrc}
                        alt="School logo"
                        fill
                        sizes="(max-width: 768px) 36px, 44px"
                        unoptimized={brandLogoSrc.startsWith("data:")}
                        className="object-cover"
                        onError={() => setBrandLogoIndex((currentIndex) => currentIndex + 1)}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-sidebar-foreground/70">
                        SC
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[...navItems, ...(user?.role === "admin" ? [
                { title: "Accounts", url: "/admin/users", icon: UserCog },
              ] : [])].map(({ title, url, icon: Icon }) => (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavItemActive(url)}
                    className={
                      isNavItemActive(url)
                        ? "bg-sidebar-primary/10 text-sidebar-foreground font-medium shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))] dark:bg-sidebar-accent dark:text-sidebar-accent-foreground"
                        : undefined
                    }
                  >
                    <Link href={url}>
                      <Icon aria-hidden="true" />
                      <span>{title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      {user?.image && <AvatarImage src={user.image} alt={user.name} />}
                      <AvatarFallback className="rounded-lg">
                        {user?.name
                          ? user.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                          : "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-semibold">{user?.name || "User"}</span>
                      <span className="truncate text-sm text-sidebar-foreground/80">
                        {user?.email || ""}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem onClick={() => setShowAccountDialog(true)}>
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setDraftSchoolSettings(schoolSettings)
                    setShowSettingsDialog(true)
                  }}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleToggleTheme}>
                    {resolvedTheme === "dark" ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} disabled={loading}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton
                size="lg"
                className="cursor-default"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    ...
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Loading...</span>
                  <span className="truncate text-sm text-sidebar-foreground/80">&nbsp;</span>
                </div>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      {mounted && (
        <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
          <DialogContent showCloseButton={false} aria-describedby={undefined} className={settingsDialogClassName}>
            <DialogTitle className="sr-only">Account Settings</DialogTitle>
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleFormChange("email", e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Profile Picture URL</Label>
                  <Input
                    id="image"
                    value={formData.image}
                    onChange={(e) => handleFormChange("image", e.target.value)}
                    placeholder="Enter image URL"
                  />
                  {formData.image && (
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground mb-2 block">Preview:</Label>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={formData.image} alt={formData.name} />
                          <AvatarFallback>{formData.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleFormChange("image", "")}
                          disabled={loading}
                        >
                          Remove Picture
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Account Information */}
                <div className="pt-4 border-t space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Account created: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last updated: {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAccountDialog(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="security" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      disabled={loading}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">
                        {showCurrentPassword ? "Hide password" : "Show password"}
                      </span>
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                      placeholder="Enter new password (min 8 characters)"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={loading}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">
                        {showNewPassword ? "Hide password" : "Show password"}
                      </span>
                    </Button>
                  </div>
                  {passwordData.newPassword && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Strength:</span>
                      <span className={`text-xs font-semibold ${passwordStrength.color}`}>
                        {passwordStrength.strength}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={loading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">
                        {showConfirmPassword ? "Hide password" : "Show password"}
                      </span>
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAccountDialog(false)} disabled={loading}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdatePassword} disabled={loading}>
                    {loading ? "Updating..." : "Update Password"}
                  </Button>
                </div>

                {/* Danger Zone */}
                <div className="pt-6 mt-6 border-t border-destructive/20">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Once you delete your account, there is no going back. Please be certain.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={loading}
                      className="w-full"
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {mounted && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeleteAccount()
                }}
                disabled={loading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {loading ? "Deleting..." : "Delete Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {mounted && (
        <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
          <DialogContent showCloseButton={false} aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]">
            <DialogTitle className="sr-only">Settings</DialogTitle>
            <div className="grid min-h-0 gap-3 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 sm:p-6 *:min-w-0 *:rounded-xl *:border *:bg-muted/25 *:p-4">
              {user?.role === "admin" ? (
                <>
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">School details</h3>
                    <p className="text-sm text-muted-foreground">These details are shared across the dashboard for all staff.</p>
                    <div className="space-y-2">
                      <Label htmlFor="school-year">School year</Label>
                      <Input id="school-year" value={draftSchoolSettings.schoolYear} maxLength={40}
                        onChange={(event) => setDraftSchoolSettings((current) => ({ ...current, schoolYear: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="school-logo">School logo</Label>
                      <Input id="school-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={readingLogo}
                        onChange={handleLogoChange} />
                      <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP, up to 512 KB. {draftSchoolSettings.logo ? "Custom logo selected." : "Using the default logo."}</p>
                    </div>
                    {draftSchoolSettings.logo && (
                      <Button variant="outline" onClick={() => setDraftSchoolSettings((current) => ({ ...current, logo: null }))}>
                        Use default logo
                      </Button>
                    )}
                    <Button onClick={handleSaveSchool} disabled={savingSchool || readingLogo}>
                      {savingSchool ? "Saving..." : "Save school details"}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">Database management</h3>
                    <p className="text-sm text-muted-foreground">
                      Download a compressed backup of the database.
                    </p>
                    <Button
                      variant="outline"
                      disabled={downloadingBackup}
                      onClick={() => {
                        setDownloadingBackup(true)
                        window.location.href = "/api/backup/download"
                        toast.success("Backup download started")
                        setTimeout(() => setDownloadingBackup(false), 3000)
                      }}
                    >
                      {downloadingBackup ? (
                        <>
                          <RotateCw className="mr-2 h-4 w-4" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <DatabaseBackup className="mr-2 h-4 w-4" />
                          Download Database Backup
                        </>
                      )}
                    </Button>
                  </div>
                  <ScpsUpdateSettings />
                </>
              ) : null}

              <div className="space-y-3">
                <h3 id="pos-mode-heading" className="text-base font-semibold">POS default mode</h3>
                <p className="text-sm text-muted-foreground">
                  Choose which mode the POS page should open with by default.
                </p>
                <div role="group" aria-labelledby="pos-mode-heading" className="grid gap-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm has-checked:border-primary/50 has-checked:bg-primary/5">
                    <input
                      type="radio"
                      id="pos-mode-tap"
                      name="pos-default-mode"
                      value="tap-first"
                      checked={localDefaultPosMode === "tap-first"}
                      onChange={(e) =>
                        setLocalDefaultPosMode(e.target.value as PosDefaultMode)
                      }
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">Tap Card</span>
                      <span className="block text-xs text-muted-foreground">Open POS ready for NFC card taps</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm has-checked:border-primary/50 has-checked:bg-primary/5">
                    <input
                      type="radio"
                      id="pos-mode-manual"
                      name="pos-default-mode"
                      value="manual"
                      checked={localDefaultPosMode === "manual"}
                      onChange={(e) =>
                        setLocalDefaultPosMode(e.target.value as PosDefaultMode)
                      }
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">Manual</span>
                      <span className="block text-xs text-muted-foreground">Open POS with customer search selected</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <h3 id="nfc-reader-heading" className="text-base font-semibold">NFC reader selection</h3>
                <p className="text-sm text-muted-foreground">
                  Choose which NFC reader to use for card taps. Each staff member can select their own reader.
                </p>
                <div role="group" aria-labelledby="nfc-reader-heading" className="grid gap-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm has-checked:border-primary/50 has-checked:bg-primary/5">
                    <input
                      type="radio"
                      id="reader-1"
                      name="nfc-reader"
                      value="reader-1"
                      checked={localSelectedReader === "reader-1"}
                      onChange={(e) => setLocalSelectedReader(e.target.value as "reader-1" | "reader-2")}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">Reader 1</span>
                      <span className="block text-xs text-muted-foreground">USB Port 0 (tty:USB0)</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 text-sm has-checked:border-primary/50 has-checked:bg-primary/5">
                    <input
                      type="radio"
                      id="reader-2"
                      name="nfc-reader"
                      value="reader-2"
                      checked={localSelectedReader === "reader-2"}
                      onChange={(e) => setLocalSelectedReader(e.target.value as "reader-1" | "reader-2")}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-medium">Reader 2</span>
                      <span className="block text-xs text-muted-foreground">USB Port 1 (tty:USB1)</span>
                    </span>
                  </label>
                </div>
              </div>

              {user?.role === "admin" ? (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold">System services</h3>
                  <p className="text-sm text-muted-foreground">
                    Restart NFC drivers and services if readers become unresponsive.
                  </p>
                  <Button
                    onClick={handleRestartServices}
                    disabled={restartingServices}
                    variant="outline"
                  >
                    {restartingServices ? (
                      <>
                        <RotateCw className="mr-2 h-4 w-4" />
                        Resetting Hardware...
                      </>
                    ) : (
                      <>
                        <RotateCw className="mr-2 h-4 w-4" />
                        Reset NFC Hardware
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-4 py-3 sm:px-6">
              <Button
                variant="outline"
                onClick={() => {
                  setLocalSelectedReader(initialPreferences.selected_reader)
                  setLocalDefaultPosMode(initialPreferences.pos_default_mode)
                  setShowSettingsDialog(false)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save preferences"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )
      }
    </Sidebar >
  )
}
