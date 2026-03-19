import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import {
  Settings,
  MessageSquare,
  Calendar,
  BarChart,
  LogOut,
  PenTool,
  FileText,
} from "lucide-react";

const ADMIN_NAV = [
  { path: "/admin", icon: BarChart, label: "Applications", num: "01" },
  { path: "/admin/interviews", icon: Calendar, label: "Interviews", num: "02" },
  { path: "/admin/communications", icon: MessageSquare, label: "Communications", num: "03" },
  { path: "/admin/questions", icon: PenTool, label: "Questions", num: "04" },
  { path: "/admin/responses", icon: FileText, label: "Responses", num: "05" },
  { path: "/admin/settings", icon: Settings, label: "Settings", num: "06" },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = profile
    ? `${(profile.first_name || profile.email)?.[0] || ""}${(profile.last_name || "")?.[0] || ""}`.toUpperCase()
    : "AD";

  return (
    <div className="flex min-h-screen bg-[#f9f9f7] text-black">
      {/* Sidebar */}
      <aside className="w-60 bg-black text-white flex flex-col fixed inset-y-0 left-0 z-10">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-2 h-2 bg-white" />
            <span className="font-['Radio_Canada_Big',sans-serif] font-medium text-white text-sm tracking-tight">
              WOSS Robotics Admin
            </span>
          </Link>
          <div className="mt-3">
            <p className="font-['Geist_Mono',monospace] text-[10px] text-white/40 uppercase tracking-[0.08em] mb-1.5">
              Cycle
            </p>
            <div className="w-full bg-white/5 border border-white/10 text-white text-xs font-['Geist_Mono',monospace] py-1.5 px-2">
              2026-2027
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {ADMIN_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center justify-between px-6 py-3 transition-colors",
                  isActive
                    ? "bg-white text-black"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                )}
              >
                <span
                  className={cn(
                    "font-['Radio_Canada_Big',sans-serif] text-sm",
                    isActive ? "text-black font-medium" : "text-white"
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    "font-['Geist_Mono',monospace] text-[10px]",
                    isActive ? "text-black/40" : "text-white/30"
                  )}
                >
                  {item.num}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-['Radio_Canada_Big',sans-serif] text-xs font-medium text-white truncate">
              {profile?.first_name || "Admin"}
            </p>
            <p className="font-['Geist_Mono',monospace] text-[10px] text-white/40 mt-0.5 truncate">{profile?.email}</p>
          </div>
          <button onClick={handleSignOut} className="text-white/40 hover:text-white transition-colors shrink-0 ml-2">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 min-h-screen flex flex-col min-w-0 overflow-x-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-[#dbe0ec] flex items-center justify-between px-8 sticky top-0 z-10">
          <p className="font-['Geist_Mono',monospace] text-[11px] text-[#6c6c6c] uppercase tracking-[0.08em]">
            WOSS Robotics · Admin
          </p>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-black flex items-center justify-center">
              <span className="font-['Geist_Mono',monospace] text-white text-[10px] font-medium">{initials}</span>
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
