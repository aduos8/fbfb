import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "sonner";

export default function Verify2FA() {
  const pageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const navScrollRef = useNavbarScroll();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const useBackup = searchParams.get("mode") === "backup";
  const [backupCode, setBackupCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([cardRef.current, headingRef.current, subRef.current, formRef.current, backRef.current], {
        filter: "blur(10px)",
        opacity: 0,
        y: 24,
      });
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(cardRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.7 }, 0.15)
        .to(headingRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.3)
        .to(subRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55 }, 0.45)
        .to(formRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.55)
        .to(backRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.4 }, 0.65);
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const backupMutation = trpc.auth.useBackupCode.useMutation({
    onSuccess: (data) => {
      sessionStorage.removeItem("pending_2fa_userId");
      toast.success("Welcome back!");
      navigate("/dashboard");
    },
    onError: (err) => {
      setError(getUserFriendlyErrorMessage(err, "Invalid backup code"));
      setLoading(false);
    },
  });

  const verifyMutation = trpc.auth.verify2FA.useMutation({
    onSuccess: (data) => {
      sessionStorage.removeItem("pending_2fa_userId");
      toast.success("Welcome back!");
      navigate("/dashboard");
    },
    onError: (err) => {
      setError(getUserFriendlyErrorMessage(err, "Invalid 2FA code"));
      setLoading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const pendingUserId = sessionStorage.getItem("pending_2fa_userId");
    if (!pendingUserId) {
      setError("Session expired. Please log in again.");
      setLoading(false);
      return;
    }

    if (useBackup) {
      backupMutation.mutate({ userId: pendingUserId, code: backupCode });
    } else {
      verifyMutation.mutate({ userId: pendingUserId, code });
    }
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

        <div className="flex-1 flex items-center justify-center px-6 py-12 md:py-16">
          <div
            ref={cardRef}
            className="w-full max-w-[536px] px-10 py-10 card-border-gradient"
          >
            <div className="text-center mb-8">
              <h2
                ref={headingRef}
                className="font-sans font-semibold text-white text-[32px] leading-[1.1] mb-3"
              >
                Two-factor authentication
              </h2>
              <p
                ref={subRef}
                className="font-sans text-[rgba(255,255,255,0.70)] text-[14px] leading-[1.5]"
              >
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>

            <div ref={formRef}>
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-5">
                  {error && (
                    <div className="px-3 py-2.5 rounded-[6px] bg-red-500/10 border border-red-500/30">
                      <p className="font-sans text-[12px] text-red-400 text-center">{error}</p>
                    </div>
                  )}

                  {!useBackup ? (
                    <div>
                      <label className="block font-sans font-normal text-white text-[15px] mb-[8px]">Verification code</label>
                      <div className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] flex items-center px-[14px] input-glow" style={{ minHeight: "41px" }}>
                        <input
                          ref={inputRef}
                          type="text"
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="000000"
                          maxLength={6}
                          required
                          className="bg-transparent w-full h-full py-2.5 outline-none font-sans font-normal text-[14px] tracking-[0.3em] text-[rgba(255,255,255,0.65)] placeholder:text-[rgba(255,255,255,0.25)] placeholder:tracking-normal"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-sans font-normal text-white text-[15px] mb-[8px]">Backup code</label>
                      <div className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] flex items-center px-[14px] input-glow" style={{ minHeight: "41px" }}>
                        <input
                          autoFocus
                          type="text"
                          value={backupCode}
                          onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                          placeholder="XXXXXXXX"
                          maxLength={8}
                          required
                          className="bg-transparent w-full h-full py-2.5 outline-none font-sans font-normal text-[14px] tracking-[0.2em] text-[rgba(255,255,255,0.65)] placeholder:text-[rgba(255,255,255,0.25)] placeholder:tracking-normal"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-2">
                    <button
                      type="submit"
                      disabled={loading || (!useBackup && code.length !== 6) || (useBackup && backupCode.length < 6)}
                      className="w-full h-[40px] rounded-[10px] bg-[#3A2AEE] text-white font-sans font-semibold text-[12px] border-r border-b border-l border-[rgba(255,255,255,0.20)] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] hover:bg-[#6B5BFF] transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Verifying..." : "Verify"}
                    </button>
                  </div>
                </div>
              </form>

              <div className="flex flex-col gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    if (useBackup) {
                      next.delete("mode");
                    } else {
                      next.set("mode", "backup");
                    }
                    setSearchParams(next, { replace: true });
                    setError("");
                    setCode("");
                    setBackupCode("");
                  }}
                  className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.50)] hover:text-white transition-colors text-left cursor-pointer bg-transparent border-0 p-0"
                >
                  {useBackup ? "Use authenticator app instead" : "Use a backup code instead"}
                </button>
                <button
                  type="button"
                  ref={backRef}
                  onClick={() => {
                    sessionStorage.removeItem("pending_2fa_userId");
                    navigate("/login");
                  }}
                  className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.80)] hover:text-white transition-colors text-left cursor-pointer bg-transparent border-0 p-0"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
