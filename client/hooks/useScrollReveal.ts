import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface RevealOpts {
  y?: number;
  opacity?: number;
  duration?: number;
  delay?: number;
  ease?: string;
  stagger?: number;
  staggerFrom?: "start" | "end" | "random";
  start?: string;
  toggleActions?: string;
  onEnter?: () => void;
  onLeaveBack?: () => void;
}

export function useScrollReveal<T extends HTMLElement>(opts: RevealOpts = {}) {
  const ref = useRef<T>(null);
  const ran = useRef(false);

  const {
    y = 24,
    opacity = 0,
    duration = 0.65,
    delay = 0,
    ease = "power3.out",
    stagger = 0,
    staggerFrom = "start",
    start = "top 94%",
    toggleActions = "play none none none",
    onEnter,
    onLeaveBack,
  } = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const targets = stagger > 0
        ? gsap.utils.toArray<HTMLElement>(".sr-item", el)
        : [el];

      if (!targets.length) return;

      gsap.set(targets, { opacity, y });

      ScrollTrigger.create({
        trigger: el,
        start,
        toggleActions,
        onEnter: () => {
          if (ran.current && staggerFrom !== "start") return;
          gsap.to(targets, {
            opacity: 1,
            y: 0,
            duration,
            delay,
            ease,
            stagger: stagger > 0 ? { amount: stagger * (targets.length - 1), from: staggerFrom } : 0,
            overwrite: true,
          });
          ran.current = true;
          onEnter?.();
        },
        onLeaveBack: () => {
          if (stagger > 0) gsap.set(targets, { opacity, y });
          onLeaveBack?.();
        },
      });
    }, el);

    return () => ctx.revert();
  }, [y, opacity, duration, delay, ease, stagger, staggerFrom, start, toggleActions, onEnter, onLeaveBack]);

  return ref;
}

export function useNavbarScroll() {
  const ref = useRef<HTMLDivElement>(null!);
  return ref;
}

export function useParallax(speed = 0.15) {
  const ref = useRef<HTMLElement>(null!);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.to(el, {
        yPercent: -speed * 100,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [speed]);

  return ref;
}

export function useMagneticButton<T extends HTMLElement>(strength = 0.3) {
  const ref = useRef<T>(null!);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      gsap.to(el, {
        x: (e.clientX - cx) * strength,
        y: (e.clientY - cy) * strength,
        duration: 0.35,
        ease: "power2.out",
      });
    };

    const onLeave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
    };

    el.addEventListener("mousemove", onMove as EventListener);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      el.removeEventListener("mousemove", onMove as EventListener);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);

  return ref;
}
