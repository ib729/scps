"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
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
  Moon,
  Sun,
  Eye,
  EyeOff,
  Radio,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useNFCReader } from "@/lib/nfc-reader-context"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

// Navigation items
const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Students",
    url: "/students",
    icon: Users,
  },
  {
    title: "Transactions",
    url: "/transactions",
    icon: Receipt,
  },
  {
    title: "POS",
    url: "/pos",
    icon: ShoppingCart,
  },
  {
    title: "Top-up",
    url: "/topup",
    icon: TrendingUp,
  },
]

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    id: string
    name: string
    email: string
    image?: string | null
    emailVerified: boolean
    createdAt: Date
    updatedAt: Date
  }
}

export function AppSidebar({ user: initialUser, ...props }: AppSidebarProps) {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { selectedReader, setSelectedReader } = useNFCReader()
  const [mounted, setMounted] = React.useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false)
  const [showAccountDialog, setShowAccountDialog] = React.useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [deletePassword, setDeletePassword] = React.useState("")
  const [localSelectedReader, setLocalSelectedReader] = React.useState(selectedReader)

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

  // Update local state when context changes
  React.useEffect(() => {
    setLocalSelectedReader(selectedReader)
  }, [selectedReader])

  // Handle saving settings
  const handleSaveSettings = () => {
    setSelectedReader(localSelectedReader)
    setShowSettingsDialog(false)
    toast.success("Settings saved successfully")
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
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }))
  }

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="grid flex-1 text-left text-base leading-tight">
                  <span className="truncate font-semibold">Student Council</span>
                  <span className="truncate text-sm">2025-2026</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
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
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.name || "User"}</span>
                      <span className="truncate text-xs">{user?.email || ""}</span>
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
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
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
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{user?.name || "User"}</span>
                        <span className="truncate text-xs">{user?.email || ""}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowAccountDialog(true)}>
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettingsDialog(true)}>
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
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Loading...</span>
                  <span className="truncate text-xs">&nbsp;</span>
                </div>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      {mounted && (
        <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
          <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Account Settings</DialogTitle>
            <DialogDescription>
              Manage your account settings and preferences.
            </DialogDescription>
          </DialogHeader>
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
                <p className="text-xs text-muted-foreground">
                  Recommended size: 200x200px or larger, square aspect ratio
                </p>
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure your application preferences
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* NFC Reader Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  NFC Reader Selection
                </Label>
                <p className="text-sm text-muted-foreground">
                  Choose which NFC reader to use for card taps. Each staff member can select their own reader.
                </p>
                <div className="space-y-3 pl-6">
                  <div className="flex items-center space-x-3">
                    <input
                      type="radio"
                      id="reader-1"
                      name="nfc-reader"
                      value="reader-1"
                      checked={localSelectedReader === "reader-1"}
                      onChange={(e) => setLocalSelectedReader(e.target.value as "reader-1" | "reader-2")}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="reader-1" className="text-sm cursor-pointer flex-1">
                      <div className="font-medium">Reader 1</div>
                      <div className="text-muted-foreground text-xs">USB Port 0 (tty:USB0)</div>
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="radio"
                      id="reader-2"
                      name="nfc-reader"
                      value="reader-2"
                      checked={localSelectedReader === "reader-2"}
                      onChange={(e) => setLocalSelectedReader(e.target.value as "reader-1" | "reader-2")}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="reader-2" className="text-sm cursor-pointer flex-1">
                      <div className="font-medium">Reader 2</div>
                      <div className="text-muted-foreground text-xs">USB Port 1 (tty:USB1)</div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setLocalSelectedReader(selectedReader)
                  setShowSettingsDialog(false)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveSettings}>
                Save Settings
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Sidebar>
  )
}

