import Navbar from "@/components/Navbar";
import { Link, useLocation } from "react-router-dom";

export default function Placeholder() {
  const location = useLocation();
  const pageName =
    location.pathname.replace("/", "").charAt(0).toUpperCase() +
    location.pathname.replace("/", "").slice(1);

  return (
    <div className="min-h-screen bg-[#0F0F11] flex flex-col">
      <div
        className="mx-4 sm:mx-8 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-24 rounded-b-[40px] md:rounded-b-[50px] overflow-hidden flex flex-col"
        style={{
          background:
            "radial-gradient(100% 100% at 50% 0%, rgba(15,15,17,0.50) 66.9%, rgba(58,42,238,0.50) 100%)",
          minHeight: "calc(100vh - 0px)",
        }}
      >
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand/20 border border-brand/30 mb-6">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3A2AEE"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <h1 className="text-white font-bold text-3xl md:text-4xl mb-3">
            {pageName}
          </h1>
          <p className="text-white/50 text-base max-w-md mb-8">
            This page is coming soon. Continue prompting to fill in the content
            for this section.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-white text-sm px-6 py-3 rounded-lg bg-brand border border-white/20 shadow-[0_2px_0.5px_0_rgba(255,255,255,0.20)_inset] hover:bg-brand-light transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M10 3L5 8L10 13"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
