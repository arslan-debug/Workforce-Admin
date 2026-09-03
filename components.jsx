import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C, CATEGORY_META, ALERT_META, WEEKDAY_NAMES, MONTH_NAMES, STATUS_OPTIONS, cx, dateParts } from "./lib.js";

export function RotationGauge({ phase, consecutive, limit, alert, size = "md" }) {
  const height = size === "lg" ? 10 : 6;
  if (!limit) {
    return (
      <div>
        <div style={{ height, borderRadius: 999, background: C.border, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "100%", background: C.borderStrong }} />
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>PERM \u00B7 no rotation limit</div>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, (consecutive / limit) * 100));
  const color = ALERT_META[alert]?.color || C.ok;
  return (
    <div>
      <div style={{ height, borderRadius: 999, background: C.border, overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999, transition: "width .4s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{consecutive}d {phase === "OFF" ? "off" : "in"}</span>
        <span>{limit}d limit</span>
      </div>
    </div>
  );
}

export function AlertPill({ alert, compact }) {
  const meta = ALERT_META[alert] || ALERT_META.OK;
  const pulsing = alert === "OVERDUE" || alert === "RETURN_DUE";
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full border font-medium", compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs")}
      style={{ color: meta.color, borderColor: meta.color + "55", background: meta.color + "14" }}
    >
      <span className={pulsing ? "pulse-dot" : ""} style={{ width: 6, height: 6, borderRadius: 999, background: meta.color, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

export function CategoryTag({ category, compact }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.BLANK;
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-md font-medium", compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs")}
      style={{ color: meta.color, background: meta.color + "16" }}
    >
      {meta.label}
    </span>
  );
}

export function KpiCard({ label, value, sub, color, Icon }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>{label}</span>
        {Icon && <Icon size={15} style={{ color }} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold" style={{ color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        {sub && <span className="text-xs" style={{ color: C.textMuted }}>{sub}</span>}
      </div>
    </div>
  );
}

export function TabButton({ active, onClick, label, Icon, badge, disabled, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      className="relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        color: disabled ? C.textMuted : active ? C.textPrimary : C.textSecondary,
        background: active && !disabled ? C.surface : "transparent",
        border: `1px solid ${active && !disabled ? C.borderStrong : "transparent"}`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <Icon size={15} />
      {label}
      {badge > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center rounded-full text-[10px] font-semibold" style={{ minWidth: 17, height: 17, padding: "0 4px", background: C.overdue, color: "#fff" }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function SlicerSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none pr-7 pl-2.5 py-1.5 rounded-md text-xs font-medium outline-none cursor-pointer"
          style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.textPrimary, minWidth: 128 }}
        >
          <option value="ALL">All</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.textMuted, pointerEvents: "none" }} />
      </div>
    </label>
  );
}

export function ThemedTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.bgPanel, border: `1px solid ${C.borderStrong}`, color: C.textPrimary }}>
      {label && <div className="font-medium mb-1" style={{ color: C.textSecondary }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.payload?.fill || C.textPrimary }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

/** Two-click confirm button — avoids relying on window.confirm, which some
 *  hosting/embedding contexts block. */
export function ConfirmButton({ onConfirm, label, confirmLabel, className, style, Icon }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      onClick={() => {
        if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 3000); return; }
        setConfirming(false);
        onConfirm();
      }}
      className={className}
      style={{ ...style, color: confirming ? "#fff" : style?.color, background: confirming ? C.overdue : style?.background }}
    >
      {Icon && <Icon size={13} />} {confirming ? (confirmLabel || "Click to confirm") : label}
    </button>
  );
}

export function MonthCalendar({ timeline, editable, onChangeDay }) {
  const groups = useMemo(() => {
    const byMonth = new Map();
    timeline.forEach((t) => {
      const key = t.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(t);
    });
    return [...byMonth.entries()];
  }, [timeline]);

  return (
    <div className="flex flex-col gap-5">
      {groups.map(([monthKey, days]) => {
        const first = dateParts(days[0].date);
        const pad = first.wd;
        return (
          <div key={monthKey}>
            <div className="text-xs font-medium mb-2" style={{ color: C.textSecondary }}>
              {MONTH_NAMES[first.m - 1]} {first.y}
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="text-center text-[10px] font-medium" style={{ color: C.textMuted }}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: pad }).map((_, i) => <div key={"pad" + i} />)}
              {days.map((t) => {
                const meta = CATEGORY_META[t.category] || CATEGORY_META.BLANK;
                const { d } = dateParts(t.date);
                const urgent = t.alert === "OVERDUE" || t.alert === "RETURN_DUE";
                if (editable) {
                  return (
                    <div key={t.date} title={t.date} className="aspect-square rounded-md flex flex-col items-center justify-center relative"
                      style={{ background: meta.color + "1c", border: `1px solid ${meta.color}55` }}>
                      <span className="text-[9px] font-medium pointer-events-none" style={{ color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{d}</span>
                      <select
                        value={t.status}
                        onChange={(ev) => onChangeDay(t.date, ev.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        style={{ fontSize: 10 }}
                      >
                        {STATUS_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                      </select>
                      <span className="text-[9px] font-semibold pointer-events-none" style={{ color: meta.color }}>{t.status || "\u2014"}</span>
                    </div>
                  );
                }
                return (
                  <div key={t.date} title={`${t.date} \u2014 ${t.status || "no data"} \u2014 ${meta.label}`}
                    className="aspect-square rounded-md flex flex-col items-center justify-center gap-0.5"
                    style={{ background: meta.color + "1c", border: `1px solid ${urgent ? meta.color : meta.color + "40"}` }}>
                    <span className="text-[10px] font-medium" style={{ color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{d}</span>
                    <span className="text-[9px] font-semibold" style={{ color: meta.color }}>{t.status || "\u2014"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
