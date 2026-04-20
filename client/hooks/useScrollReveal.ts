import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealOptions {
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

export function useScrollReveal<T extends HTMLElement>(
  options: ScrollRevealOptions = {}
) {
  const ref = useRef<T>(null);
  const hasRun = useRef(false);

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
  } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const targets = stagger > 0
        ? gsap.utils.toArray<HTMLElement>(".sr-item", el)
        : [el];

      if (targets.length === 0) return;

      gsap.set(targets, { opacity, y });

      ScrollTrigger.create({
        trigger: el,
        start,
        toggleActions,
        onEnter: () => {
          if (hasRun.current && staggerFrom !== "start") return;
          gsap.to(targets, {
            opacity: 1,
            y: 0,
            duration,
            delay,
            ease,
            stagger: stagger > 0 ? { amount: stagger * (targets.length - 1), from: staggerFrom } : 0,
            overwrite: true,
          });
          hasRun.current = true;
          onEnter?.();
        },
        onLeaveBack: () => {
          if (stagger > 0) {
            gsap.set(targets, { opacity, y });
          }
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

export function useParallax(speed: number = 0.15) {
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

export function useMagneticButton<T extends HTMLElement>(
  strength: number = 0.3
) {
  const ref = useRef<T>(null!);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;

      gsap.to(el, {
        x: dx,
        y: dy,
        duration: 0.35,
        ease: "power2.out",
      });
    };

    const handleLeave = () => {
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: "elastic.out(1, 0.4)",
      });
    };

    el.addEventListener("mousemove", handleMove as EventListener);
    el.addEventListener("mouseleave", handleLeave);

    return () => {
      el.removeEventListener("mousemove", handleMove as EventListener);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, [strength]);

  return ref;
}
