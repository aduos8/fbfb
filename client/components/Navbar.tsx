import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { isAuthenticated, clearToken, isAdmin } from "@/lib/auth";
import { ChevronDown, LogOut, User, CreditCard, ShoppingBag, Coins, Bell, Tag, Activity } from "lucide-react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const authed = isAuthenticated();
  const adminMode = isAdmin();

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

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = () => {
    clearToken();
    setMenuOpen(false);
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `font-sans font-normal text-sm transition-colors ${
      isActive(path)
        ? "text-white"
        : "text-white/50 hover:text-white/80"
    }`;

  if (authed) {
    return (
      <div className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 flex items-center justify-between py-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-sans font-semibold text-base text-white">
            (brand)
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/" className={navLinkClass("/")}>
              Search
            </Link>
            <Link to="/dashboard" className={navLinkClass("/dashboard")}>
              Dashboard
            </Link>
            <Link to="/tracking" className={navLinkClass("/tracking")}>
              Tracking
            </Link>
            <Link to="/pricing" className={navLinkClass("/pricing")}>
              Pricing
            </Link>
            <Link to="/credits" className={navLinkClass("/credits")}>
              Credits
            </Link>
            {adminMode && (
              <Link to="/admin" className={navLinkClass("/admin")}>
                Admin
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 cursor-pointer bg-transparent border-0"
            >
              <div className="w-[31px] h-[31px] rounded-full bg-[rgba(58,42,238,0.3)] flex items-center justify-center overflow-hidden">
                {profile?.profile ? (
                  typeof profile.profile === 'object' && (profile.profile as any)?.username ? (
                    <span className="text-[12px] text-white font-semibold leading-none">
                      {((profile.profile as any).username as string).charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )
                ) : (
                  <User className="w-4 h-4 text-white" />
                )}
              </div>
              <span className="font-sans font-normal text-[12px] text-white">
                {typeof profile?.profile === 'object' && (profile.profile as any)?.username
                  ? (profile.profile as any).username
                  : "User"}
              </span>
              <ChevronDown className="w-4 h-4 text-white" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[180px] bg-[#111018] border border-[rgba(58,42,238,0.3)] rounded-[5px] overflow-hidden z-50 shadow-2xl">
                <div className="px-1.5 pt-1 pb-1">
                  <Link
                    to="/credits"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5 text-white/60" />
                    Credits Ledger
                  </Link>
                  <Link
                    to="/account"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-white/60" />
                    Account
                  </Link>
                  <Link
                    to="/purchases"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-white/60" />
                    Purchases
                  </Link>
                  <Link
                    to="/tracking"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-white/60" />
                    Tracking
                  </Link>
                  <Link
                    to="/notifications"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Bell className="w-3.5 h-3.5 text-white/60" />
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3A2AEE] flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/pricing"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-white/60" />
                    Subscription
                  </Link>
                  <Link
                    to="/vouchers"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer"
                  >
                    <Tag className="w-3.5 h-3.5 text-white/60" />
                    Redeem Voucher
                  </Link>
                </div>
                <div className="h-px bg-[rgba(255,255,255,0.08)] mx-2" />
                <div className="px-1.5 pb-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2.5 w-full px-2 py-2 font-sans font-normal text-[13px] text-white rounded-[4px] hover:bg-[rgba(58,42,238,0.15)] transition-colors cursor-pointer bg-transparent border-0"
                  >
                    <LogOut className="w-3.5 h-3.5 text-white/60" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-[5px] bg-[#3A2AEE] border border-[rgba(255,255,255,0.2)] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)]">
            <Coins className="w-3.5 h-3.5 text-white" />
            <span className="font-sans font-normal text-[10px] text-white">
              {balance?.credits ?? "..."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 flex items-center justify-between py-4">
      <div className="flex items-center gap-8">
        <Link to="/" className="font-sans font-semibold text-base text-white">
          (brand)
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/" className={navLinkClass("/")}>
            Search
          </Link>
          <Link to="/insights" className={navLinkClass("/insights")}>
            Insights
          </Link>
          <Link to="/features" className={navLinkClass("/features")}>
            Features
          </Link>
          <Link to="/pricing" className={navLinkClass("/pricing")}>
            Pricing
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-4">
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
    </div>
  );
}
