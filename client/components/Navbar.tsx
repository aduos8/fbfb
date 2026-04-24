import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { useAuthState } from "@/lib/hooks/useAuthState";
import {
  ChevronDown,
  LogOut,
  User,
  CreditCard,
  ShoppingBag,
  Coins,
  Bell,
  Tag,
  Activity,
  Menu,
  X,
} from "lucide-react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const authed = isAuthenticated();
  const { user, isAdmin: adminMode } = useAuthState();
  const utils = trpc.useUtils();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: async () => {
      clearToken();
      await utils.invalidate();
      setMenuOpen(false);
      setMobileOpen(false);
      navigate("/login");
    },
  });

  const { data: profile } = trpc.account.getProfile.useQuery(undefined, {
    enabled: authed,
  });
  const { data: balance } = trpc.account.getBalance.useQuery(undefined, {
    enabled: authed,
  });
  const { data: unreadData } = trpc.notifications.getUnread.useQuery(undefined, {
    enabled: authed,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.unread ?? 0;

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `font-sans font-normal text-sm transition-colors ${
      isActive(path) ? "text-white" : "text-white/50 hover:text-white/80"
    }`;

  const mobileLinkClass = (path: string) =>
    `font-sans font-normal text-base transition-colors py-3 border-b border-white/[0.06] ${
      isActive(path) ? "text-white" : "text-white/60"
    }`;

  const displayName =
    typeof profile?.profile === "object" && (profile.profile as any)?.username
      ? (profile.profile as any).username
      : user?.username || "User";

  const avatarLetter =
    typeof profile?.profile === "object" && (profile.profile as any)?.username
      ? ((profile.profile as any).username as string).charAt(0).toUpperCase()
      : null;

  if (authed) {
    return (
      <>
        {/* Desktop / mobile top bar */}
        <div className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 flex items-center justify-between py-4">
          {/* Left: brand + desktop nav links */}
          <div className="flex items-center gap-8">
            <Link to="/" className="font-sans font-semibold text-base text-white">
              (brand)
            </Link>
            {/* Desktop links — hidden on mobile */}
            <div className="hidden md:flex items-center gap-6">
              <Link to="/" className={navLinkClass("/")}>Search</Link>
              <Link to="/dashboard" className={navLinkClass("/dashboard")}>Dashboard</Link>
              <Link to="/tracking" className={navLinkClass("/tracking")}>Tracking</Link>
              <Link to="/pricing" className={navLinkClass("/pricing")}>Pricing</Link>
              <Link to="/credits" className={navLinkClass("/credits")}>Credits</Link>
              {adminMode && (
                <Link to="/admin" className={navLinkClass("/admin")}>Admin</Link>
              )}
            </div>
          </div>

          {/* Right: bell + user menu + credits (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-3">
            {/* Bell — always visible */}
            <Link
              to="/notifications"
              className="relative p-2 rounded-[6px] hover:bg-white/[0.05] transition-colors"
            >
              <Bell className="w-5 h-5 text-white/60" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#3A2AEE] flex items-center justify-center">
                  <span className="text-[9px] font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </span>
              )}
            </Link>

            {/* User dropdown — desktop only */}
            <div ref={menuRef} className="relative hidden md:block">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 cursor-pointer bg-transparent border-0"
              >
                <div className="w-[31px] h-[31px] rounded-full bg-[rgba(58,42,238,0.3)] flex items-center justify-center overflow-hidden">
                  {avatarLetter ? (
                    <span className="text-[12px] text-white font-semibold leading-none">
                      {avatarLetter}
                    </span>
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-sans font-normal text-[12px] text-white">{displayName}</span>
                <ChevronDown className="w-4 h-4 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-[180px] bg-[#111018] border border-[rgba(58,42,238,0.3)] rounded-[5px] overflow-hidden z-50 shadow-2xl">
                  <div className="px-1.5 pt-1 pb-1">
                    <Link to="/credits" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <Coins className="w-3.5 h-3.5 text-white/60" />Credits Ledger
                    </Link>
                    <Link to="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <User className="w-3.5 h-3.5 text-white/60" />Account
                    </Link>
                    <Link to="/purchases" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <ShoppingBag className="w-3.5 h-3.5 text-white/60" />Purchases
                    </Link>
                    <Link to="/tracking" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <Activity className="w-3.5 h-3.5 text-white/60" />Tracking
                    </Link>
                    <Link to="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center justify-between px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <span className="flex items-center gap-2.5">
                        <Bell className="w-3.5 h-3.5 text-white/60" />Notifications
                      </span>
                      {unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3A2AEE] flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-white">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        </span>
                      )}
                    </Link>
                    <Link to="/pricing" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <CreditCard className="w-3.5 h-3.5 text-white/60" />Subscription
                    </Link>
                    <Link to="/vouchers" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer">
                      <Tag className="w-3.5 h-3.5 text-white/60" />Redeem Voucher
                    </Link>
                  </div>
                  <div className="h-px bg-[rgba(255,255,255,0.08)] mx-2" />
                  <div className="px-1.5 pb-1">
                    <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer bg-transparent border-0">
                      <LogOut className="w-3.5 h-3.5 text-white/60" />Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Credits chip — desktop only */}
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-[5px] bg-[#3A2AEE] border border-[rgba(255,255,255,0.2)] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]">
              <Coins className="w-3.5 h-3.5 text-white" />
              <span className="font-sans font-normal text-[10px] text-white">
                {balance?.credits ?? "..."}
              </span>
            </div>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-[6px] hover:bg-white/[0.05] transition-colors bg-transparent border-0"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Menu className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden mx-4 pb-4 flex flex-col">
            {/* User info row */}
            <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-[31px] h-[31px] rounded-full bg-[rgba(58,42,238,0.3)] flex items-center justify-center">
                  {avatarLetter ? (
                    <span className="text-[12px] text-white font-semibold leading-none">{avatarLetter}</span>
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <span className="font-sans font-normal text-sm text-white">{displayName}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-[5px] bg-[#3A2AEE] border border-[rgba(255,255,255,0.2)]">
                <Coins className="w-3.5 h-3.5 text-white" />
                <span className="font-sans font-normal text-[10px] text-white">
                  {balance?.credits ?? "..."}
                </span>
              </div>
            </div>

            {/* Nav links */}
            <Link to="/" className={mobileLinkClass("/")}>Search</Link>
            <Link to="/dashboard" className={mobileLinkClass("/dashboard")}>Dashboard</Link>
            <Link to="/tracking" className={mobileLinkClass("/tracking")}>Tracking</Link>
            <Link to="/pricing" className={mobileLinkClass("/pricing")}>Pricing</Link>
            <Link to="/credits" className={mobileLinkClass("/credits")}>Credits</Link>
            {adminMode && (
              <Link to="/admin" className={mobileLinkClass("/admin")}>Admin</Link>
            )}

            {/* Account links */}
            <Link to="/account" className={mobileLinkClass("/account")}>Account</Link>
            <Link to="/purchases" className={mobileLinkClass("/purchases")}>Purchases</Link>
            <Link to="/vouchers" className={mobileLinkClass("/vouchers")}>Redeem Voucher</Link>
            <Link to="/notifications" className="flex items-center justify-between font-sans font-normal text-base text-white/60 transition-colors py-3 border-b border-white/[0.06]">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3A2AEE] flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </span>
              )}
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 py-3 font-sans font-normal text-base text-white/60 bg-transparent border-0 cursor-pointer mt-1"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </>
    );
  }

  // Unauthenticated
  return (
    <>
      <div className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 flex items-center justify-between py-4">
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link to="/" className="font-sans font-semibold text-base text-white">
            (brand)
          </Link>
          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className={navLinkClass("/")}>Search</Link>
            <Link to="/insights" className={navLinkClass("/insights")}>Insights</Link>
            <Link to="/features" className={navLinkClass("/features")}>Features</Link>
            <Link to="/pricing" className={navLinkClass("/pricing")}>Pricing</Link>
          </div>
        </div>

        {/* Right: auth buttons (desktop) + hamburger (mobile) */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/login"
              className="font-sans font-normal text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="flex items-center justify-center px-4 py-2 rounded-[8px] bg-[#3A2AEE] font-sans font-semibold text-sm text-white hover:bg-[#6B5BFF] transition-colors btn-press shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
            >
              Sign up
            </Link>
          </div>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-[6px] hover:bg-white/[0.05] transition-colors bg-transparent border-0"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5 text-white" />
            ) : (
              <Menu className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer — unauthenticated */}
      {mobileOpen && (
        <div className="md:hidden mx-4 pb-4 flex flex-col">
          <Link to="/" className={mobileLinkClass("/")}>Search</Link>
          <Link to="/insights" className={mobileLinkClass("/insights")}>Insights</Link>
          <Link to="/features" className={mobileLinkClass("/features")}>Features</Link>
          <Link to="/pricing" className={mobileLinkClass("/pricing")}>Pricing</Link>
          <div className="flex flex-col gap-3 pt-4">
            <Link
              to="/login"
              className="font-sans font-normal text-sm text-white/60 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="flex items-center justify-center px-4 py-2.5 rounded-[8px] bg-[#3A2AEE] font-sans font-semibold text-sm text-white hover:bg-[#6B5BFF] transition-colors shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]"
            >
              Sign up
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
