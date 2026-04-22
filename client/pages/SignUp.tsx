import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useNavbarScroll } from "@/hooks/useScrollReveal";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth";import { getUserFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "sonner";

export default function SignUp() {
  const navigate = useNavigate();

  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  const pageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const footerLineRef = useRef<HTMLParagraphElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const navScrollRef = useNavbarScroll();
  const [agreed, setAgreed] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Account created. Welcome!");
      navigate("/dashboard");
    },
    onError: (err) => {
      setError(getUserFriendlyErrorMessage(err, "Registration failed"));
      setLoading(false);
    },
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(
        [cardRef.current, headingRef.current, subRef.current, formRef.current, footerLineRef.current, backRef.current],
        { filter: "blur(10px)", opacity: 0, y: 24 }
      );

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(cardRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.7 }, 0.15)
        .to(headingRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.3)
        .to(subRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.55 }, 0.45)
        .to(formRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.6 }, 0.55)
        .to(footerLineRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.45 }, 0.65)
        .to(backRef.current, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.4 }, 0.72);
    }, pageRef);

    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!agreed) {
      setError("You must agree to the terms of use");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    registerMutation.mutate({ username, email, password });
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
              <h1
                ref={headingRef}
                className="font-sans font-semibold text-white text-[40px] leading-[1.0] mb-4"
              >
                (logo)
              </h1>
              <h2 className="font-sans font-semibold text-white text-[40px] leading-[1.0]">
                Create account
              </h2>
            </div>

            <p
              ref={subRef}
              className="font-sans font-normal text-[rgba(255,255,255,0.80)] text-[20px] leading-[1.4] mb-8 text-center"
            >
              Get started with our platform
            </p>

            <div ref={formRef}>
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-5">
                  {error && (
                    <div className="px-3 py-2.5 rounded-[6px] bg-red-500/10 border border-red-500/30">
                      <p className="font-sans font-normal text-[12px] text-red-400 text-center">{error}</p>
                    </div>
                  )}

                  <div>
                    <label className="block font-sans font-normal text-white text-[15px] mb-[8px]">
                      Username
                    </label>
                    <div className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] flex items-center px-[14px] input-glow" style={{ minHeight: "41px" }}>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="your_username"
                        required
                        minLength={3}
                        maxLength={30}
                        pattern="[a-zA-Z0-9_-]+"
                        className="bg-transparent w-full h-full py-2.5 outline-none font-sans font-normal text-[12px] text-[rgba(255,255,255,0.65)] placeholder:text-[rgba(255,255,255,0.25)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-sans font-normal text-white text-[15px] mb-[8px]">
                      Email
                    </label>
                    <div className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] flex items-center px-[14px] input-glow" style={{ minHeight: "41px" }}>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        required
                        className="bg-transparent w-full h-full py-2.5 outline-none font-sans font-normal text-[12px] text-[rgba(255,255,255,0.65)] placeholder:text-[rgba(255,255,255,0.25)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-sans font-normal text-white text-[15px] mb-[8px]">
                      Password
                    </label>
                    <div className="bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] flex items-center px-[14px] input-glow mb-[12px]" style={{ minHeight: "41px" }}>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                        minLength={8}
                        className="bg-transparent w-full h-full py-2.5 outline-none font-sans font-normal text-[12px] text-[rgba(255,255,255,0.65)] placeholder:text-[rgba(255,255,255,0.25)]"
                      />
                    </div>
                    <div className="flex items-center gap-[10px]">
                      <button
                        type="button"
                        onClick={() => setAgreed(!agreed)}
                        className="w-[17px] h-[17px] rounded-[3px] bg-[#232327] border border-[rgba(255,255,255,0.10)] flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 hover:border-[rgba(58,42,238,0.5)]"
                        aria-label="Toggle agreement"
                      >
                        {agreed && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#3A2AEE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <p className="font-sans font-normal text-[9px] text-[rgba(255,255,255,0.80)] leading-[1.5]">
                        I agree to the{" "}
                        <button type="button" className="text-[#3A2AEE] hover:text-[#6B5BFF] transition-colors">
                          terms of use
                        </button>
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <button
                      type="submit"
                      disabled={!agreed || loading}
                      className="w-full h-[40px] rounded-[10px] bg-[#3A2AEE] text-white font-sans font-semibold text-[12px] border-r border-b border-l border-[rgba(255,255,255,0.20)] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] hover:bg-[#6B5BFF] transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Creating account..." : "Create Account"}
                    </button>
                  </div>

                  <p
                    ref={footerLineRef}
                    className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.80)] text-center mt-2"
                  >
                    Already have an account?{" "}
                    <Link to="/login" className="text-[#3A2AEE] hover:text-[#6B5BFF] transition-colors">
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>

              <button
                ref={backRef}
                onClick={() => navigate("/")}
                className="font-sans font-normal text-[12px] text-[rgba(255,255,255,0.80)] hover:text-white transition-colors text-left mt-4 cursor-pointer bg-transparent border-0 p-0"
              >
                Back to home
              </button>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
