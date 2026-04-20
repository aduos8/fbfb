import { useRef, useEffect } from "react";
import gsap from "gsap";

interface FooterProps {
  lineRef?: React.RefObject<HTMLElement | null>;
}

export default function Footer({ lineRef }: FooterProps) {
  const internalLineRef = useRef<HTMLDivElement>(null);
  const ref = (lineRef ?? internalLineRef) as React.RefObject<HTMLDivElement | null>;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { filter: "blur(6px)", opacity: 0, y: 8 });
    gsap.to(el, { filter: "blur(0px)", opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  }, [ref]);

  return (
    <div ref={ref} className="mt-20 md:mt-28" style={{ opacity: 0 }}>
      <div
        className="mx-6 sm:mx-10 md:mx-14 lg:mx-20 xl:mx-28 2xl:mx-36"
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 15%, rgba(255,255,255,0.08) 85%, transparent 100%)",
        }}
      />
      <div className="px-6 sm:px-10 md:px-14 lg:px-20 xl:px-28 2xl:px-36 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-[14px] text-white/30 font-sans tracking-wide">(brand)</span>
        <span className="text-[13px] text-white/25 font-sans">2026 (brand). All rights reserved.</span>
      </div>
    </div>
  );
}
