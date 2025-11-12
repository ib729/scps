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
} from "lucide-react"
import { useTheme } from "next-themes"

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
    image: string | null
    emailVerified: boolean
    createdAt: Date
    updatedAt: Date
  }
}

export function AppSidebar({ user: initialUser, ...props }: AppSidebarProps) {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = React.useState(false)
  const [showAccountDialog, setShowAccountDialog] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  // Use server-provided user data as the primary source
  // Only use useSession for reactive updates (e.g., after sign out)
  const { data: session } = authClient.useSession()
  const user = session?.user || initialUser

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
        image: formData.image || undefined,
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
                <Input 
                  id="current-password" 
                  type="password" 
                  value={passwordData.currentPassword}
                  onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                  placeholder="Enter current password" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input 
                  id="new-password" 
                  type="password" 
                  value={passwordData.newPassword}
                  onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                  placeholder="Enter new password (min 8 characters)" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  value={passwordData.confirmPassword}
                  onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                  placeholder="Confirm new password" 
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAccountDialog(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleUpdatePassword} disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      )}
    </Sidebar>
  )
}

