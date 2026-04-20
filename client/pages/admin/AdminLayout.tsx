import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import {
  Users, CreditCard, Ticket, ShoppingBag, ScrollText,
  ShieldEllipsis, LayoutDashboard, ChevronRight, X, Menu
} from "lucide-react";

const adminNav = [
  { path: "/admin", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" />, exact: true },
  { path: "/admin/users", label: "Users", icon: <Users className="w-4 h-4" /> },
  { path: "/admin/credits", label: "Credits", icon: <CreditCard className="w-4 h-4" /> },
  { path: "/admin/vouchers", label: "Vouchers", icon: <Ticket className="w-4 h-4" /> },
  { path: "/admin/purchases", label: "Purchases", icon: <ShoppingBag className="w-4 h-4" /> },
  { path: "/admin/audit-logs", label: "Audit Logs", icon: <ScrollText className="w-4 h-4" /> },
  { path: "/admin/redactions", label: "Redactions", icon: <ShieldEllipsis className="w-4 h-4" /> },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (item: typeof adminNav[0]) =>
    item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);

  const { data: profile } = trpc.account.getProfile.useQuery();

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    gsap.fromTo(el,
      { x: -24, opacity: 0, filter: "blur(8px)" },
      { x: 0, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "cubic-bezier(0.32,0.72,0,1)" }
    );
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="font-sans font-semibold text-[14px] text-white/70">Admin Panel</span>
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {adminNav.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 transition-all duration-200 cursor-pointer border-0 text-left group ${
                active
                  ? "bg-[rgba(58,42,238,0.08)]"
                  : "hover:bg-white/[0.02]"
              }`}
            >
              <span className={active ? "text-white/80" : "text-white/40 group-hover:text-white/60"}>
                {item.icon}
              </span>
              <span className={`font-sans font-medium text-[13px] ${active ? "text-white" : "text-white/50"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[6px] hover:bg-white/[0.02] transition-colors cursor-pointer bg-transparent border-0 text-left"
        >
          <span className="font-sans font-normal text-[11px] text-white/40 hover:text-white/60">Back to Dashboard</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div className="nav-float">
          <Navbar />
        </div>

        <div className="flex px-6 sm:px-10 lg:px-14 xl:px-20 py-6 gap-6">
          <div
            ref={sidebarRef}
            className="hidden md:flex flex-col rounded-[14px] overflow-hidden shrink-0 w-[220px]"
            style={{ background: "rgba(17,16,24,0.8)", border: "1px solid rgba(58,42,238,0.15)" }}
          >
            <SidebarContent />
          </div>

          <button
            className="md:hidden fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#3A2AEE] flex items-center justify-center shadow-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-white" />
          </button>

          {sidebarOpen && (
            <div className="md:hidden fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
              <div
                className="w-[280px] rounded-l-[20px] overflow-hidden"
                style={{ background: "rgba(17,16,24,0.95)", border: "1px solid rgba(58,42,238,0.2)" }}
              >
                <div className="flex justify-end p-4">
                  <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white cursor-pointer bg-transparent border-0">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SidebarContent />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
    </div>
  );
}
