import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> });
};

type ChartCtx = { config: ChartConfig };
const ChartCtx = React.createContext<ChartCtx | null>(null);

function useChart() {
  const ctx = React.useContext(ChartCtx);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

const ChartContainer = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"] }>(
  ({ id, className, children, config, ...props }, ref) => {
    const uid = React.useId();
    const chartId = `chart-${id || uid.replace(/:/g, "")}`;
    return (
      <ChartCtx.Provider value={{ config }}>
        <div data-chart={chartId} ref={ref} className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none", className)} {...props}>
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartCtx.Provider>
    );
  }
);
ChartContainer.displayName = "Chart";

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorCfg = Object.entries(config).filter(([, c]) => c.theme || c.color);
  if (!colorCfg.length) return null;
  return (
    <style dangerouslySetInnerHTML={{ __html: Object.entries(THEMES).map(([theme, prefix]) => `${prefix} [data-chart=${id}] {${colorCfg.map(([key, itemCfg]) => { const color = itemCfg.theme?.[theme as keyof typeof itemCfg.theme] || itemCfg.color; return color ? `  --color-${key}: ${color};` : null; }).join("\n")} }`).join("\n") }} />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof RechartsPrimitive.Tooltip> & React.ComponentProps<"div"> & { hideLabel?: boolean; hideIndicator?: boolean; indicator?: "line" | "dot" | "dashed"; nameKey?: string; labelKey?: string }>(
  ({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, color, nameKey, labelKey }, ref) => {
    const { config } = useChart();
    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) return null;
      const [item] = payload;
      const key = `${labelKey || item.dataKey || item.name || "value"}`;
      const itemCfg = getPayloadConfigFromPayload(config, item, key);
      const val = !labelKey && typeof label === "string" ? config[label as keyof typeof config]?.label || label : itemCfg?.label;
      if (labelFormatter) return <div className={cn("font-medium", labelClassName)}>{labelFormatter(val, payload)}</div>;
      return val ? <div className={cn("font-medium", labelClassName)}>{val}</div> : null;
    }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);
    if (!active || !payload?.length) return null;
    const nestLabel = payload.length === 1 && indicator !== "dot";
    return (
      <div ref={ref} className={cn("grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl", className)}>
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, idx) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`;
            const itemCfg = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = color || item.payload.fill || item.color;
            return (
              <div key={item.dataKey} className={cn("flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground", indicator === "dot" && "items-center")}>
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, idx, item.payload)
                ) : (
                  <>
                    {!hideIndicator && (
                      <div className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", indicator === "dot" ? "h-2.5 w-2.5" : indicator === "line" ? "w-1" : "w-0 border-[1.5px] border-dashed bg-transparent")} style={{ "--color-bg": indicatorColor, "--color-border": indicatorColor } as React.CSSProperties} />
                    )}
                    <div className={cn("flex flex-1 justify-between leading-none", nestLabel ? "items-end" : "items-center")}>
                      <div className="grid gap-1.5">{nestLabel ? tooltipLabel : null}<span className="text-muted-foreground">{itemCfg?.label || item.name}</span></div>
                      {item.value && <span className="font-mono font-medium tabular-nums text-foreground">{item.value.toLocaleString()}</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = "ChartTooltip";

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & { hideIcon?: boolean; nameKey?: string }>(
  ({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
    const { config } = useChart();
    if (!payload?.length) return null;
    return (
      <div ref={ref} className={cn("flex items-center justify-center gap-4", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`;
          const itemCfg = getPayloadConfigFromPayload(config, item, key);
          return (
            <div key={item.value} className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground">
              {itemCfg?.icon && !hideIcon ? <itemCfg.icon /> : <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />}
              {itemCfg?.label}
            </div>
          );
        })}
      </div>
    );
  }
);
ChartLegendContent.displayName = "ChartLegend";

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) return undefined;
  const p = "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : undefined;
  let cfgKey: string = key;
  if (key in payload && typeof payload[key as keyof typeof payload] === "string") cfgKey = payload[key as keyof typeof payload] as string;
  else if (p && key in p && typeof p[key as keyof typeof p] === "string") cfgKey = p[key as keyof typeof p] as string;
  return cfgKey in config ? config[cfgKey] : config[key as keyof typeof config];
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle };
