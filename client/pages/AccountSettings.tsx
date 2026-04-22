import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { trpc } from "@/lib/trpc";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { clearToken } from "@/lib/auth";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowUpRight, ArrowDownRight, PlusCircle, Shield, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";

export default function AccountSettings() {
  const pageRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: profile } = trpc.account.getProfile.useQuery();
  const { data: balanceData } = trpc.credits.getBalance.useQuery();
  const { data: transactions } = trpc.credits.listTransactions.useQuery({ limit: 20 });
  const { data: packages } = trpc.purchases.getPackages.useQuery();

  const utils = trpc.useUtils();

  const updateProfile = trpc.account.updateProfile.useMutation({
    onSuccess: () => {
      utils.account.getProfile.invalidate();
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const changePassword = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Passphrase changed successfully");
      setCurrPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const deleteAccount = trpc.account.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Account deleted");
      clearToken();
      navigate("/");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const createPurchase = trpc.purchases.createPurchase.useMutation({
    onSuccess: (data) => {
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast.success("Credits added!");
      }
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const profileData = profile?.profile as any;
  const txns = (transactions?.transactions || []) as any[];

  const [displayName, setDisplayName] = useState(profileData?.username || "");
  const [currPassword, setCurrPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showCurr, setShowCurr] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [purchasingPkg, setPurchasingPkg] = useState<string | null>(null);
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "confirm" | "disable">("idle");
  const [twoFaSecret, setTwoFaSecret] = useState("");
  const [twoFaQr, setTwoFaQr] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaDisablePassword, setTwoFaDisablePassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const { data: twoFaStatus, refetch: refetchTwoFa } = trpc.auth.get2FAStatus.useQuery();

  const setup2FA = trpc.auth.setup2FA.useMutation({
    onSuccess: async (data) => {
      setTwoFaSecret(data.secret);
      if (data.otpauthUrl) {
        const qr = await QRCode.toDataURL(data.otpauthUrl);
        setTwoFaQr(qr);
      }
      setTwoFaStep("confirm");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const confirm2FA = trpc.auth.confirm2FA.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setTwoFaStep("idle");
      refetchTwoFa();
      toast.success("2FA enabled");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  const disable2FA = trpc.auth.disable2FA.useMutation({
    onSuccess: () => {
      setTwoFaStep("idle");
      setTwoFaDisablePassword("");
      refetchTwoFa();
      toast.success("2FA disabled");
    },
    onError: (e) => toast.error(getUserFriendlyErrorMessage(e)),
  });

  useEffect(() => {
    if (profileData?.username) {
      setDisplayName(profileData.username);
    }
  }, [profileData]);

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

  const handleSaveProfile = () => {
    updateProfile.mutate({ displayName });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    changePassword.mutate({ currentPassword: currPassword, newPassword });
  };

  const handleDeleteAccount = () => {
    if (deletePassword.length < 8) {
      toast.error("Enter your password to confirm deletion");
      return;
    }
    deleteAccount.mutate({ password: deletePassword });
  };

  const handleBuyCredits = (pkg: { credits: number; price_cents: number }) => {
    setPurchasingPkg(`${pkg.credits}`);
    createPurchase.mutate({ credits: pkg.credits, price_cents: pkg.price_cents });
  };

  const getAccountAge = () => {
    if (!profileData?.created_at) return "-";
    const created = new Date(profileData.created_at);
    const now = new Date();
    const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "1 day";
    return `${days} days`;
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

        <div className="px-6 sm:px-10 lg:px-14 xl:px-20 py-8 md:py-10 flex flex-col gap-8">
          <div ref={headerRef} style={{ filter: "blur(10px)", opacity: 0 }}>
            <h1 className="font-sans font-normal text-[28px] sm:text-[32px] md:text-[35px] text-white leading-none">
              Account <span className="font-handwriting text-[#3A2AEE] text-[32px] sm:text-[36px] md:text-[40px]">Settings</span>
            </h1>
            <p className="font-sans font-normal text-[13px] sm:text-[14px] md:text-[15px] text-white/50 mt-3">
              Manage your profile, security, and account preferences
            </p>
          </div>

          <div ref={contentRef} className="flex flex-col gap-6" style={{ filter: "blur(10px)", opacity: 0 }}>
            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-5">
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-1">Email</span>
                    <span className="font-sans font-medium text-[14px] md:text-[15px] text-white/80">{profileData?.email || "-"}</span>
                  </div>
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-1">Role</span>
                    <span className="font-sans font-medium text-[14px] md:text-[15px] text-[#3A2AEE]">{profileData?.role || "Customer"}</span>
                  </div>
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-1">Account Age</span>
                    <span className="font-sans font-medium text-[14px] md:text-[15px] text-white/80">{getAccountAge()}</span>
                  </div>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Display Name</span>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your display name"
                      className="flex-1 bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[44px] px-4 outline-none font-sans font-normal text-[13px] md:text-[14px] text-white/80 placeholder:text-white/25 input-glow"
                    />
                    <button
                      onClick={handleSaveProfile}
                      disabled={updateProfile.isPending}
                      className="px-6 rounded-[10px] bg-[#3A2AEE] font-sans font-normal text-[13px] md:text-[14px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] disabled:opacity-50"
                    >
                      {updateProfile.isPending ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Security</h2>
              <div className="flex flex-col gap-4 max-w-[500px]">
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Current Passphrase</span>
                  <div className="relative">
                    <input
                      type={showCurr ? "text" : "password"}
                      value={currPassword}
                      onChange={(e) => setCurrPassword(e.target.value)}
                      placeholder="Enter current passphrase"
                      className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 pr-14 outline-none font-sans font-normal text-[14px] text-white/80 placeholder:text-white/25 transition-colors focus:border-[rgba(58,42,238,0.4)]"
                    />
                    <button type="button" onClick={() => setShowCurr(!showCurr)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 cursor-pointer bg-transparent border-0 p-0 transition-colors">
                      {showCurr ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">New Passphrase</span>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 pr-14 outline-none font-sans font-normal text-[14px] text-white/80 placeholder:text-white/25 transition-colors focus:border-[rgba(58,42,238,0.4)]"
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 cursor-pointer bg-transparent border-0 p-0 transition-colors">
                      {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Confirm Passphrase</span>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new passphrase"
                      className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 pr-14 outline-none font-sans font-normal text-[14px] text-white/80 placeholder:text-white/25 transition-colors focus:border-[rgba(58,42,238,0.4)]"
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 cursor-pointer bg-transparent border-0 p-0 transition-colors">
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={handleChangePassword}
                disabled={changePassword.isPending || !currPassword || !newPassword || !confirmPassword}
                className="mt-6 px-6 py-3 rounded-[12px] bg-[#3A2AEE] font-sans font-semibold text-[14px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.3)] disabled:opacity-50"
              >
                {changePassword.isPending ? "Updating..." : "Update Passphrase"}
              </button>
            </div>

            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Top Up Credits</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                {(packages || []).map((pkg: any) => (
                  <button
                    key={pkg.credits}
                    onClick={() => handleBuyCredits(pkg)}
                    disabled={purchasingPkg === `${pkg.credits}`}
                    className="rounded-[10px] p-4 text-center transition-all cursor-pointer border-0"
                    style={{
                      background: "rgba(58,42,238,0.12)",
                      border: "1px solid rgba(58,42,238,0.2)",
                    }}
                  >
                    <div className="font-sans font-bold text-white text-[22px] mb-1">
                      {pkg.credits}
                    </div>
                    <div className="font-sans font-normal text-[11px] text-white/40 mb-2">credits</div>
                    <div className="font-sans font-semibold text-[#3A2AEE] text-[14px]">
                      ${(pkg.price_cents / 100).toFixed(0)}
                    </div>
                  </button>
                ))}
              </div>
              <p className="font-sans font-normal text-[10px] text-white/25">
                Payment processed securely via Oxapay. Supports BTC, ETH, USDT and other cryptocurrencies.
              </p>
            </div>

            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white mb-6">Activity & Credits</h2>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Credits</span>
                  <span className="font-sans font-bold text-[28px] text-white">{balanceData?.balance?.toLocaleString() ?? "0"}</span>
                </div>
                <div>
                  <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Searches</span>
                  <span className="font-sans font-bold text-[28px] text-white">{balanceData?.total_searches?.toLocaleString() ?? "0"}</span>
                </div>
              </div>
              {txns.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 className="font-sans font-semibold text-[13px] text-white/70 mb-4 mt-6">Recent Transactions</h3>
                  <div className="flex flex-col gap-1">
                    {txns.slice(0, 5).map((txn: any, i: number) => {
                      const isPositive = txn.amount > 0;
                      return (
                        <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: i < txns.slice(0, 5).length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <div className="flex items-center gap-3">
                            {isPositive ? <ArrowDownRight className="w-4 h-4 text-[#05df72]" /> : <ArrowUpRight className="w-4 h-4 text-[#ff4a4a]" />}
                            <div>
                              <span className="font-sans font-normal text-[12px] md:text-[13px] text-white/80 capitalize block">{txn.transaction_type?.replace(/_/g, " ") || "Transaction"}</span>
                              <span className="font-sans font-normal text-[10px] text-white/40">{txn.created_at ? new Date(txn.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "-"}</span>
                            </div>
                          </div>
                          <span className={`font-mono font-medium text-[13px] md:text-[14px] ${isPositive ? "text-[#05df72]" : "text-[#ff4a4a]"}`}>{isPositive ? "+" : ""}{txn.amount}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>


            <div className="card-border-gradient rounded-[20px] p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {twoFaStatus?.enabled ? <ShieldCheck className="w-5 h-5 text-[#05df72]" /> : <Shield className="w-5 h-5 text-white/40" />}
                  <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-white">Two-Factor Authentication</h2>
                </div>
                <span className={`font-sans font-normal text-[11px] px-3 py-1 rounded-full ${twoFaStatus?.enabled ? "bg-[#05df72]/10 text-[#05df72]" : "bg-white/5 text-white/40"}`}>
                  {twoFaStatus?.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              {twoFaStep === "idle" && backupCodes.length === 0 && (
                <div className="flex flex-col gap-4">
                  <p className="font-sans font-normal text-[13px] md:text-[14px] text-white/50 leading-relaxed">
                    {twoFaStatus?.enabled ? "Your account is protected with an authenticator app." : "Add an extra layer of security using Google Authenticator, Authy, or any TOTP app."}
                  </p>
                  {twoFaStatus?.enabled ? (
                    <button onClick={() => setTwoFaStep("disable")} className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[13px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer border border-red-500/30 w-fit">
                      <ShieldOff className="w-4 h-4" /> Disable 2FA
                    </button>
                  ) : (
                    <button onClick={() => setup2FA.mutate()} disabled={setup2FA.isPending} className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#3A2AEE] font-sans font-normal text-[13px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 w-fit disabled:opacity-50">
                      <Shield className="w-4 h-4" /> {setup2FA.isPending ? "Setting up..." : "Enable 2FA"}
                    </button>
                  )}
                </div>
              )}

              {twoFaStep === "confirm" && (
                <div className="flex flex-col gap-5 max-w-[420px]">
                  <p className="font-sans font-normal text-[13px] text-white/50">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                  {twoFaQr && <img src={twoFaQr} alt="QR Code" className="w-[160px] h-[160px] rounded-[12px] bg-white p-2" />}
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Manual entry key</span>
                    <span className="font-mono text-[12px] text-white/60 bg-white/5 px-3 py-2 rounded-[8px] block break-all">{twoFaSecret}</span>
                  </div>
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Verification code</span>
                    <input
                      type="text"
                      value={twoFaCode}
                      onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 outline-none font-sans font-normal text-[14px] tracking-[0.3em] text-white/80 placeholder:text-white/25 placeholder:tracking-normal focus:border-[rgba(58,42,238,0.4)]"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => confirm2FA.mutate({ secret: twoFaSecret, code: twoFaCode })} disabled={twoFaCode.length !== 6 || confirm2FA.isPending} className="px-5 py-2.5 rounded-[10px] bg-[#3A2AEE] font-sans font-normal text-[13px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 disabled:opacity-50">
                      {confirm2FA.isPending ? "Verifying..." : "Confirm & Enable"}
                    </button>
                    <button onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaSecret(""); setTwoFaQr(""); }} className="px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[13px] text-white/60 hover:bg-white/5 transition-colors cursor-pointer border border-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {twoFaStep === "disable" && (
                <div className="flex flex-col gap-4 max-w-[400px]">
                  <p className="font-sans font-normal text-[13px] text-white/50">Enter your password to disable two-factor authentication.</p>
                  <input
                    type="password"
                    value={twoFaDisablePassword}
                    onChange={(e) => setTwoFaDisablePassword(e.target.value)}
                    placeholder="Your password"
                    className="w-full bg-[#1a1a1f] border border-[rgba(255,255,255,0.08)] rounded-[12px] h-[48px] px-5 outline-none font-sans font-normal text-[14px] text-white/80 placeholder:text-white/25 focus:border-[rgba(58,42,238,0.4)]"
                  />
                  <div className="flex gap-3">
                    <button onClick={() => disable2FA.mutate({ password: twoFaDisablePassword })} disabled={!twoFaDisablePassword || disable2FA.isPending} className="px-5 py-2.5 rounded-[10px] bg-red-500 font-sans font-normal text-[13px] text-white hover:bg-red-600 transition-colors cursor-pointer border-0 disabled:opacity-50">
                      {disable2FA.isPending ? "Disabling..." : "Disable 2FA"}
                    </button>
                    <button onClick={() => { setTwoFaStep("idle"); setTwoFaDisablePassword(""); }} className="px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[13px] text-white/60 hover:bg-white/5 transition-colors cursor-pointer border border-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {backupCodes.length > 0 && (
                <div className="flex flex-col gap-4">
                  <p className="font-sans font-normal text-[13px] text-[#05df72]">2FA enabled. Save these backup codes somewhere safe - they won't be shown again.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <span key={i} className="font-mono text-[12px] text-white/70 bg-white/5 px-3 py-2 rounded-[8px] text-center">{code}</span>
                    ))}
                  </div>
                  <button onClick={() => setBackupCodes([])} className="px-5 py-2.5 rounded-[10px] bg-[#3A2AEE] font-sans font-normal text-[13px] text-white hover:bg-[#4a3aff] transition-colors cursor-pointer border-0 w-fit">
                    Done
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-[20px] p-6 md:p-8" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <h2 className="font-sans font-semibold text-[15px] md:text-[17px] text-red-400 mb-4">Danger Zone</h2>
              <p className="font-sans font-normal text-[13px] md:text-[14px] text-white/50 leading-relaxed mb-5">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[13px] md:text-[14px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer border border-red-500/30">
                  Delete Account
                </button>
              ) : (
                <div className="flex flex-col gap-4 max-w-[400px]">
                  <div>
                    <span className="font-sans font-normal text-[11px] text-white/50 uppercase tracking-[0.06em] block mb-2">Confirm by entering your password</span>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Your password"
                      className="w-full bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[44px] px-4 outline-none font-sans font-normal text-[13px] md:text-[14px] text-white/80 placeholder:text-white/25 input-glow"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleDeleteAccount} disabled={deleteAccount.isPending || deletePassword.length < 8} className="px-5 py-2.5 rounded-[10px] bg-red-500 font-sans font-normal text-[13px] md:text-[14px] text-white hover:bg-red-600 transition-colors cursor-pointer border-0 disabled:opacity-50">
                      {deleteAccount.isPending ? "Deleting..." : "Yes, Delete Permanently"}
                    </button>
                    <button onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); }} className="px-5 py-2.5 rounded-[10px] bg-transparent font-sans font-normal text-[13px] md:text-[14px] text-white/60 hover:bg-white/5 transition-colors cursor-pointer border border-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#0F0F11] min-h-[40px]" />
      <Footer />
    </div>
  );
}
