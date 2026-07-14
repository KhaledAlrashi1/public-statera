import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Sparkles,
  Scale,
  ChevronDown,
  X,
  Menu,
  Plus,
  User,
  Search,
  LogOut,
  Moon,
  Sun,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useIsFetching } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { useDarkMode } from "@/lib/useDarkMode"
import { useAuth, getUserFirstName } from "@/contexts/AuthContext"
import { QuickAddProvider, useQuickAdd } from "@/contexts/QuickAddContext"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/toaster"
import CommandPalette from "./CommandPalette"

// ============================================================
// Navigation items — Profile is accessible via the user-name
// button in the header, not as a nav tab.
// ============================================================

type NavItem = {
  to: string
  icon: typeof LayoutDashboard
  label: string
}

const baseNavItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/activity", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/plan", icon: Wallet, label: "Plan" },
  { to: "/insights", icon: Sparkles, label: "Insights" },
]

const navActiveClass = "bg-primary/12 text-primary ring-1 ring-primary/20 shadow-none after:absolute after:bottom-0.5 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-primary"
const navActiveDrawerClass = "bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
const navActiveMobileClass = "border-primary bg-primary/10 text-primary"
const loadingColor = "var(--color-app-accent)"

// ============================================================
// AppShell
// ============================================================

function AppShellLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { openQuickAdd } = useQuickAdd()
  const { isDark, toggleDarkMode } = useDarkMode()
  const toast = useToast()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const isFetching = useIsFetching()

  const showQuickAddFab = true
  const navItems = useMemo(() => baseNavItems, [])

  // Route-derived default type, shared by the FAB and the "L" shortcut.
  const handleQuickAdd = useCallback(() => {
    const requestedType = new URLSearchParams(location.search).get("type")
    const defaultType =
      location.pathname === "/income" || requestedType === "income" ? "income" : "expense"
    openQuickAdd(defaultType)
  }, [location.search, location.pathname, openQuickAdd])

  // Global "L" shortcut → same QuickAdd path as the FAB (item 2). Fires only when
  // the authenticated shell is mounted (this component), no modifier is held, focus
  // is not inside a text-entry control, and no dialog/drawer overlay is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() !== "l") return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable ||
        el?.getAttribute("role") === "combobox"
      ) {
        return
      }
      // Any OPEN dialog/drawer/command-palette suppresses the shortcut — prevents
      // double-fire and firing over a modal. The nav drawer is always in the DOM
      // (role="dialog") and hidden via aria-hidden when closed, so exclude
      // aria-hidden="true"; open Radix dialogs never set that attribute.
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) return
      e.preventDefault()
      handleQuickAdd()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [handleQuickAdd])

  const isNavItemActive = useCallback(
    (to: string, isActive: boolean) => {
      if (isActive) return true
      if (to === "/" && location.pathname === "/home") return true
      return false
    },
    [location.pathname]
  )

  // ------- Collapsible header on scroll -------
  const [headerHidden, setHeaderHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setHeaderHidden(y > 60 && y > lastScrollY.current)
      lastScrollY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // ------- Scroll restoration -------
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" })
    setHeaderHidden(false)
    lastScrollY.current = 0
  }, [location.pathname])

  // ------- Drawer: escape key + body scroll lock -------
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!drawerOpen) return
    document.body.style.overflow = "hidden"

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [drawerOpen, closeDrawer])

  // Focus trap: return focus when drawer closes
  const openBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!drawerOpen && openBtnRef.current) {
      openBtnRef.current.focus()
    }
  }, [drawerOpen])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!userMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [userMenuOpen])

  const handleLogout = useCallback(async () => {
    setSigningOut(true)
    setUserMenuOpen(false)
    try {
      await logout()
      closeDrawer()
      navigate("/login", { replace: true })
    } catch {
      toast.error("We couldn't sign you out right now. Please try again.")
    } finally {
      setSigningOut(false)
    }
  }, [closeDrawer, logout, navigate, toast])

  return (
    <div className="relative min-h-screen bg-background pb-16 lg:pb-0">
      {/* Skip to content — a11y */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Quiet background surface */}
      <div className="pointer-events-none absolute inset-0 app-surface" />

      {/* ==================== Header ==================== */}
      <header
        className={cn(
          "sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur transition-transform duration-300",
          headerHidden && "-translate-y-full"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-6 lg:px-8">
          {/* Logo / wordmark */}
          <div className="flex items-center gap-3">
            <div className="bg-accent text-accent-foreground brand-mark flex h-10 w-10 items-center justify-center transition-all duration-300">
              <Scale className="icon-hero" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight text-foreground">
                Statera
              </div>
              <div className="text-xs text-muted-foreground">
                Find your balance
              </div>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Main navigation">
            {navItems.map((item) => {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                        "group relative inline-flex items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-semibold transition-all duration-200",
                        isNavItemActive(item.to, isActive)
                          ? navActiveClass
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )
                  }
                >
                  <item.icon className="icon-inline" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          {/* Right-side actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => setCommandOpen(true)}
              className="hidden rounded-full px-3 text-xs text-muted-foreground lg:inline-flex"
              aria-label="Open command palette"
            >
              <Search className="icon-inline" />
              <span>Quick actions</span>
              <kbd className="rounded border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                ⌘K
              </kbd>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleDarkMode}
              className="rounded-full text-muted-foreground"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="icon-inline" /> : <Moon className="icon-inline" />}
            </Button>

            {/* User name pill menu */}
            {user && (
              <div ref={userMenuRef} className="relative hidden items-center gap-2 lg:flex">
                <Button
                  type="button"
                  variant="pill"
                  size="default"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="h-9 gap-1.5 px-3 text-xs text-muted-foreground"
                  aria-label="Open user menu"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  <User className="icon-inline" />
                  <span className="max-w-[120px] truncate">{getUserFirstName(user)}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>

                {userMenuOpen ? (
                  <div
                    className="absolute right-0 top-11 z-50 min-w-[180px] rounded-2xl border border-border/70 bg-background p-2 shadow-[var(--shadow-level-3)]"
                    role="menu"
                    aria-label="User menu"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start rounded-xl text-sm"
                      onClick={() => {
                        setUserMenuOpen(false)
                        navigate("/profile")
                      }}
                      role="menuitem"
                    >
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start rounded-xl text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        void handleLogout()
                      }}
                      disabled={signingOut}
                      role="menuitem"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      {signingOut ? "Signing out..." : "Sign out"}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            {/* Mobile hamburger */}
            <Button
              ref={openBtnRef}
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full text-muted-foreground lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="nav-drawer"
            >
              <Menu className="icon-section" />
            </Button>
          </div>
        </div>

        {/* Loading bar */}
        {isFetching > 0 && (
          <div
            className="loading-bar"
            style={{ "--loading-color": loadingColor } as React.CSSProperties}
          />
        )}
      </header>

      {/* ==================== Mobile Drawer ==================== */}
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          drawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        ref={drawerRef}
        id="nav-drawer"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[min(320px,85vw)] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out lg:hidden",
          drawerOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!drawerOpen}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-accent text-accent-foreground brand-mark flex h-10 w-10 items-center justify-center transition-all duration-300">
              <Scale className="icon-hero" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Statera</div>
              <div className="text-xs text-muted-foreground">Find your balance</div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={closeDrawer}
            className="rounded-full text-muted-foreground"
            aria-label="Close navigation menu"
          >
            <X className="icon-section" />
          </Button>
        </div>

        {/* Drawer nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label="Navigation">
          <ul className="space-y-1">
            {navItems.map((item) => {
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    onClick={closeDrawer}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200",
                        isNavItemActive(item.to, isActive)
                          ? navActiveDrawerClass
                          : "text-foreground hover:bg-muted"
                      )
                    }
                  >
                    <item.icon className="icon-inline" />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Drawer footer */}
        <div className="border-t border-border px-5 py-3 space-y-2">
          {user && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { closeDrawer(); navigate("/profile") }}
              className="h-auto w-full justify-start gap-2 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <User className="icon-inline" />
              <span className="max-w-[200px] truncate">{getUserFirstName(user)}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              closeDrawer()
              setCommandOpen(true)
            }}
            className="w-full justify-center gap-2 rounded-full text-xs text-muted-foreground"
          >
            <Search className="icon-inline" />
            <span>Quick actions</span>
          </Button>
          {user ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void handleLogout()
              }}
              disabled={signingOut}
              className="w-full justify-center gap-2 rounded-full text-xs text-destructive"
            >
              <LogOut className="icon-inline" />
              <span>{signingOut ? "Signing out..." : "Sign out"}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleDarkMode}
            className="w-full justify-center gap-2 rounded-full text-xs text-muted-foreground"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="icon-inline" /> : <Moon className="icon-inline" />}
            <span>{isDark ? "Light mode" : "Dark mode"}</span>
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            v1.0 · Statera
          </div>
        </div>
      </aside>

      {/* ==================== Main content ==================== */}
      <main id="main-content" className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* ==================== Mobile Bottom Tab Bar ==================== */}
      <nav
        className="bottom-tabs fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-lg lg:hidden"
        aria-label="Tab navigation"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {navItems.map((item) => {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "group relative flex flex-1 flex-col items-center gap-0.5 border-t-2 px-1 pb-2 pt-2 text-[10px] font-semibold transition-colors duration-200",
                    isNavItemActive(item.to, isActive)
                      ? navActiveMobileClass
                      : "border-transparent text-muted-foreground"
                  )
                }
              >
                <span className="relative">
                  <item.icon className="icon-hero" />
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* ==================== Quick Action FAB ==================== */}
      {/* Single visible QuickAdd trigger at every breakpoint (operator ruling
          2026-07-12, supersedes the design-3 dual-trigger layout). z-40 keeps it
          below Radix dialog/drawer portals (z-50), so it never occludes a dialog
          footer; bottom-20 clears the mobile bottom-tabs, lg:bottom-6 tightens on
          desktop (no bottom-tabs). Tooltip is the shortcut's only visible hint. */}
      {showQuickAddFab ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              onClick={handleQuickAdd}
              className="fixed bottom-20 end-4 z-40 h-14 w-14 rounded-[var(--radius-card)] bg-primary shadow-elevation-3 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 lg:bottom-6 lg:end-8"
              aria-label="Log transaction"
            >
              <Plus className="icon-hero" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Log transaction — L</TooltipContent>
        </Tooltip>
      ) : null}

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}

export default function AppShell() {
  return (
    <QuickAddProvider>
      <AppShellLayout />
    </QuickAddProvider>
  )
}
