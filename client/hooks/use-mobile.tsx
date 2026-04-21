import * as React from "react";

const BREAK = 768;

export function useIsMobile() {
  const [val, setVal] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAK - 1}px)`);
    const onChange = () => setVal(window.innerWidth < BREAK);
    mq.addEventListener("change", onChange);
    setVal(window.innerWidth < BREAK);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return !!val;
}
