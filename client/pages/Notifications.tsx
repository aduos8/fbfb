import { useRef, useEffect } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Image,
  Type,
  Phone,
  Crown,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Clock,
} from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: {
    profile_user_id?: string;
    profile_username?: string;
    old_value?: string;
    new_value?: string;
    avatar_url?: string;
    is_premium?: boolean;
    credits_balance?: number;
    renewal_days?: number;
    [key: string]: unknown;
  };
  read: boolean;
  created_at: string;
}

const notificationIcons: Record<string, React.ReactNode> = {
  username_changed: <User className="w-4 h-4" />,
  display_name_changed: <Type className="w-4 h-4" />,
  bio_updated: <Type className="w-4 h-4" />,
  profile_photo_changed: <Image className="w-4 h-4" />,
  phone_changed: <Phone className="w-4 h-4" />,
  premium_status_changed: <Crown className="w-4 h-4" />,
  credits_low: <AlertCircle className="w-4 h-4" />,
  tracking_renewal: <RefreshCw className="w-4 h-4" />,
  tracking_expired: <AlertCircle className="w-4 h-4" />,
  subscription_expired: <AlertCircle className="w-4 h-4" />,
  system: <CheckCircle className="w-4 h-4" />,
};

const typeLabels: Record<string, string> = {
  username_changed: "USER",
  display_name_changed: "USER",
  bio_updated: "USER",
  profile_photo_changed: "USER",
  phone_changed: "USER",
  premium_status_changed: "PREMIUM",
  credits_low: "SYSTEM",
  tracking_renewal: "SYSTEM",
  tracking_expired: "SYSTEM",
  subscription_expired: "SYSTEM",
  system: "SYSTEM",
};

const typeBadgeStyles: Record<string, string> = {
  username_changed: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  display_name_changed: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  bio_updated: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  profile_photo_changed: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  phone_changed: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  premium_status_changed: "bg-[rgba(176,122,204,0.1)] border-[#b07acc] text-[#b07acc]",
  credits_low: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  tracking_renewal: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
  tracking_expired: "bg-[rgba(239,68,68,0.1)] border-[#ef4444] text-[#ef4444]",
  subscription_expired: "bg-[rgba(239,68,68,0.1)] border-[#ef4444] text-[#ef4444]",
  system: "bg-[rgba(58,42,238,0.1)] border-[#3a2aee] text-[#3a2aee]",
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}M AGO`;
  } else if (diffHours < 24) {
    return `${diffHours}H AGO`;
  } else {
    return `${diffDays}D AGO`;
  }
}

function getAvatarUrl(notification: NotificationItem): string | null {
  if (notification.data.avatar_url) {
    return notification.data.avatar_url;
  }
  return null;
}

export default function Notifications() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const {
    data,
    isLoading,
    refetch,
  } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      refetch();
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([headerRef.current, contentRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 20,
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(headerRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.2)
        .to(contentRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.35);
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const notifications = (data?.notifications || []) as NotificationItem[];
  const unreadCount = data?.unread ?? 0;
  const unreadNotifications = notifications.filter((n) => !n.read);
  const readNotifications = notifications.filter((n) => n.read);

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.read) {
      markReadMutation.mutate({ id: notification.id });
    }
  };

  const renderNotification = (notification: NotificationItem, index: number) => {
    const avatarUrl = getAvatarUrl(notification);
    const hasAvatar = avatarUrl || notification.data.profile_username;
    const isUnread = !notification.read;

    return (
      <div
        key={notification.id}
        onClick={() => handleNotificationClick(notification)}
        className={`
          relative cursor-pointer transition-all duration-200
          ${isUnread ? "bg-[#111018]" : ""}
          ${isUnread ? "border-l-2 border-[#3a2aee]" : "border-l-2 border-transparent"}
          hover:bg-[#111018]/80
        `}
      >
        <div className="flex items-start gap-4 px-8 py-5">
          {hasAvatar ? (
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-[41px] h-[40px] rounded-[6px] object-cover"
                />
              ) : (
                <div className="w-[41px] h-[40px] rounded-[6px] bg-[#232327] flex items-center justify-center">
                  <span className="text-[18px] font-semibold text-white/60">
                    {notification.data.profile_username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {isUnread && (
                <div className="absolute -top-1 -right-1 w-[6px] h-[6px]">
                  <svg viewBox="0 0 6 6" fill="none">
                    <circle cx="3" cy="3" r="3" fill="#3A2AEE" />
                  </svg>
                </div>
              )}
            </div>
          ) : (
            <div className="shrink-0">
              <div
                className={`w-[41px] h-[16px] rounded-[2px] border-[0.5px] backdrop-blur-[16.5px] flex items-center justify-center ${typeBadgeStyles[notification.type] || typeBadgeStyles.system}`}
              >
                <span className="text-[8px] font-medium uppercase tracking-wider">
                  {typeLabels[notification.type] || "SYSTEM"}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-sans font-medium text-[13px] text-white truncate pr-4">
                {notification.title}
              </h3>
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className={`w-[41px] h-[16px] rounded-[2px] border-[0.5px] backdrop-blur-[16.5px] flex items-center justify-center ${typeBadgeStyles[notification.type] || typeBadgeStyles.system}`}
                >
                  <span className="text-[8px] font-medium uppercase tracking-wider">
                    {typeLabels[notification.type] || "SYSTEM"}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-white/40 whitespace-nowrap">
                  {formatTimeAgo(notification.created_at)}
                </span>
              </div>
            </div>

            {notification.body && (
              <p className="font-sans font-normal text-[12px] text-white/50 mt-1.5 line-clamp-2">
                {notification.body}
              </p>
            )}

            {notification.data.profile_username && (
              <p className="font-mono text-[10px] text-white/30 mt-2">
                USER{" "}
                <span className="text-[#3a2aee]">
                  @{notification.data.profile_username}
                </span>
              </p>
            )}
          </div>
        </div>

        {index < notifications.length - 1 && (
          <div className="absolute bottom-0 left-[48px] right-[48px] h-px bg-white/[0.04]" />
        )}
      </div>
    );
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div className="px-6 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-8 flex-1">
          <div ref={headerRef} style={{ filter: "blur(10px)", opacity: 0 }}>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Notification{" "}
              <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">
                Feed
              </span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3">
              Tracking alerts and system activity
            </p>
          </div>

          <div ref={contentRef} className="flex flex-col gap-6" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-sans font-medium text-[12px] text-[#3A2AEE] uppercase tracking-[0.08em]">
                  {unreadCount} UNREAD
                </span>
              </div>
              <button
                onClick={handleMarkAllRead}
                disabled={markAllReadMutation.isPending || unreadCount === 0}
                className="px-4 py-2 rounded-[4px] bg-[rgba(17,16,24,0.5)] border border-[rgba(58,42,238,0.2)] font-sans font-medium text-[10px] text-white/50 uppercase tracking-wider hover:bg-[rgba(58,42,238,0.1)] hover:text-white/70 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {markAllReadMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Marking...
                  </span>
                ) : (
                  "Mark All Read"
                )}
              </button>
            </div>

            <div className="card-border-gradient rounded-[20px] overflow-hidden">
              {isLoading ? (
                <div className="py-16 px-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-8 h-8 border-2 border-[#3A2AEE] border-t-transparent rounded-full animate-spin" />
                    <span className="font-sans text-[13px] text-white/40">Loading notifications...</span>
                  </div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 px-8">
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#232327] flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-white/30" />
                    </div>
                    <span className="font-sans text-[14px] text-white/50">No notifications yet</span>
                    <span className="font-sans text-[12px] text-white/30">We'll notify you when something happens</span>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {unreadNotifications.length > 0 && (
                    <>
                      {unreadNotifications.map((notification, index) =>
                        renderNotification(notification, index)
                      )}
                    </>
                  )}

                  {readNotifications.length > 0 && (
                    <>
                      {unreadNotifications.length > 0 && (
                        <div className="py-3 px-8 bg-[#0F0F11]/50">
                          <span className="font-sans text-[10px] text-white/30 uppercase tracking-[0.08em]">
                            Previously Read
                          </span>
                        </div>
                      )}
                      {readNotifications.map((notification, index) =>
                        renderNotification(notification, unreadNotifications.length + index)
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-2 px-6 py-3 rounded-[8px] text-[#3A2AEE] hover:text-[#6B5BFF] transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="font-sans text-[13px]">Refresh</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}
