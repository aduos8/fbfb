import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Link, Navigate } from 'react-router-dom';
import { useNavbarScroll } from '@/hooks/useScrollReveal';
import { trpc } from '@/lib/trpc';
import { isAuthenticated } from '@/lib/auth';

export default function ForgotPassword() {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  const pageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const navScrollRef = useNavbarScroll();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  const reset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setDone(true),
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set([cardRef.current], { filter: 'blur(10px)', opacity: 0, y: 24 });
      gsap.to(cardRef.current, { filter: 'blur(0px)', opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.15 });
    }, pageRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reset.mutate({ email });
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 flex-1 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background: "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "100vh",
        }}
      >
        <div ref={navScrollRef} className="nav-float">
          <Navbar />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12 md:py-16">
          <div ref={cardRef} className="w-full max-w-[536px] px-10 py-10 card-border-gradient">
            {done ? (
              <div className="text-center">
                <h2 className="font-sans font-semibold text-white text-[28px] mb-4">Check your email</h2>
                <p className="font-sans text-[rgba(255,255,255,0.7)] text-[14px]">
                  If an account exists with that email, we've sent a reset link.
                </p>
                <Link to="/login" className="mt-6 inline-block font-sans text-[#3A2AEE] hover:text-[#6B5BFF] text-[12px]">
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="font-sans font-semibold text-white text-[32px] mb-2">Reset password</h2>
                  <p className="font-sans text-[rgba(255,255,255,0.7)] text-[14px]">
                    Enter your email and we'll send a reset link.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div>
                    <label className="block font-sans font-normal text-white text-[15px] mb-2">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      required
                      className="w-full bg-[#232327] border border-[rgba(255,255,255,0.10)] rounded-[7px] h-[41px] px-[14px] outline-none font-sans font-normal text-[12px] text-[rgba(255,255,255,0.85)] placeholder:text-[rgba(255,255,255,0.25)] input-glow"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={reset.isPending}
                    className="w-full h-[40px] rounded-[10px] bg-[#3A2AEE] text-white font-sans font-semibold text-[12px] border-r border-b border-l border-[rgba(255,255,255,0.20)] shadow-[inset_0px_2px_0.5px_0px_rgba(255,255,255,0.30)] hover:bg-[#6B5BFF] transition-colors btn-press disabled:opacity-50"
                  >
                    {reset.isPending ? 'Sending...' : 'Send reset link'}
                  </button>
                  <Link to="/login" className="text-center font-sans text-[12px] text-[rgba(255,255,255,0.6)] hover:text-white">
                    Back to sign in
                  </Link>
                </form>
              </>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
