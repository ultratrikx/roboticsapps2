import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import {
  Settings,
  MessageSquare,
  Calendar,
  BarChart3,
  LogOut,
  PenTool,
  FileText,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Review",
    items: [
      { path: "/admin", icon: BarChart3, label: "Applications", exact: true },
      { path: "/admin/interviews", icon: Calendar, label: "Interviews" },
      { path: "/admin/rankings", icon: Trophy, label: "Rankings" },
    ],
  },
  {
    label: "Content",
    items: [
      { path: "/admin/responses", icon: FileText, label: "Responses" },
      { path: "/admin/questions", icon: PenTool, label: "Questions" },
      { path: "/admin/communications", icon: MessageSquare, label: "Communications" },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/admin/settings", icon: Settings, label: "Settings" },
    ],
  },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("admin-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = profile
    ? `${(profile.first_name || profile.email)?.[0] || ""}${(profile.last_name || "")?.[0] || ""}`.toUpperCase()
    : "AD";

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <div className="flex min-h-screen bg-[#f9f9f7] text-black">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-black text-white flex flex-col fixed inset-y-0 left-0 z-20 transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "border-b border-white/10 flex items-center",
            collapsed ? "px-0 py-5 justify-center" : "px-5 py-5 gap-3"
          )}
        >
          <Link
            to="/"
            title="WOSS Robotics"
            className={cn(
              "flex items-center shrink-0",
              collapsed ? "justify-center" : "gap-2.5 min-w-0"
            )}
          >
            <div className="w-6 h-6 bg-white flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5 text-black" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-['Radio_Canada_Big',sans-serif] font-medium text-white text-sm leading-tight truncate">
                  WOSS Robotics
                </p>
                <p className="font-['Geist_Mono',monospace] text-[9px] text-white/40 uppercase tracking-[0.08em]">
                  Admin · 2026–2027
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={cn(gi !== 0 && "mt-1")}>
              {/* Group label */}
              {!collapsed && (
                <p className="font-['Geist_Mono',monospace] text-[9px] text-white/25 uppercase tracking-[0.12em] px-5 pt-3 pb-1.5">
                  {group.label}
                </p>
              )}
              {collapsed && gi !== 0 && (
                <div className="mx-3 my-2 border-t border-white/10" />
              )}

              {group.items.map((item) => {
                const active = isActive(item.path, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 transition-colors relative group",
                      collapsed
                        ? "justify-center px-0 py-3 mx-2 rounded"
                        : "px-5 py-2.5",
                      active
                        ? "bg-white text-black"
                        : "text-white/60 hover:bg-white/8 hover:text-white"
                    )}
                  >
                    {/* Active left accent (expanded only) */}
                    {!collapsed && active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white/40" />
                    )}

                    <Icon
                      className={cn(
                        "shrink-0 transition-colors",
                        collapsed ? "w-5 h-5" : "w-4 h-4",
                        active ? "text-black" : "text-white/60 group-hover:text-white"
                      )}
                    />

                    {!collapsed && (
                      <span
                        className={cn(
                          "font-['Radio_Canada_Big',sans-serif] text-sm leading-none flex-1",
                          active ? "text-black font-medium" : "text-white/80"
                        )}
                      >
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-white/10">
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full flex items-center gap-3 px-5 py-3 text-white/40 hover:text-white hover:bg-white/5 transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 shrink-0" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="font-['Geist_Mono',monospace] text-[10px] uppercase tracking-[0.08em]">
                  Collapse
                </span>
              </>
            )}
          </button>
        </div>

        {/* User */}
        <div
          className={cn(
            "border-t border-white/10 flex items-center",
            collapsed ? "px-0 py-3.5 justify-center flex-col gap-2" : "px-5 py-3.5 gap-3"
          )}
        >
          <div className="w-7 h-7 bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
            <span className="font-['Geist_Mono',monospace] text-white text-[10px] font-medium">
              {initials}
            </span>
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-['Radio_Canada_Big',sans-serif] text-xs font-medium text-white truncate leading-tight">
                {profile?.first_name
                  ? `${profile.first_name} ${profile.last_name || ""}`.trim()
                  : "Admin"}
              </p>
              <p className="font-['Geist_Mono',monospace] text-[9px] text-white/40 mt-0.5 truncate">
                {profile?.email}
              </p>
            </div>
          )}

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="text-white/40 hover:text-white transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 min-h-screen flex flex-col min-w-0 overflow-x-hidden transition-all duration-300",
          collapsed ? "ml-16" : "ml-60"
        )}
      >
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-[#dbe0ec] flex items-center justify-between px-8 sticky top-0 z-10">
          <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.08em]">
            WOSS Robotics · Admin
          </p>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-black flex items-center justify-center">
              <span className="font-['Geist_Mono',monospace] text-white text-[10px] font-medium">
                {initials}
              </span>
            </div>
          </div>
        </header>
        <div className="p-8 flex-1 min-w-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
