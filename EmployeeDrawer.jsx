import React, { useMemo, useState } from "react";
import { X, Pencil, Trash2, SquarePen } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { C, CATEGORY_META, buildTimeline, localExpatOf, formatDateShort } from "./lib.js";
import { RotationGauge, AlertPill, CategoryTag, MonthCalendar, ThemedTooltip, ConfirmButton } from "./components.jsx";

export default function EmployeeDrawer({ emp, dateList, onClose, onEditDay, onEdit, onDelete }) {
  const [editMode, setEditMode] = useState(false);
  const timeline = useMemo(() => (emp ? buildTimeline(emp.daysArr, dateList, emp.rot) : []), [emp, dateList]);
  const monthly = useMemo(() => {
    const counts = {};
    Object.keys(CATEGORY_META).forEach((k) => (counts[k] = 0));
    timeline.forEach((t) => (counts[t.category] = (counts[t.category] || 0) + 1));
    return Object.entries(counts).filter(([k, v]) => k !== "BLANK" && v > 0).map(([k, v]) => ({ name: CATEGORY_META[k].label, value: v, fill: CATEGORY_META[k].color }));
  }, [timeline]);

  if (!emp) return null;
  const latest = timeline[timeline.length - 1];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(3,5,8,0.6)" }} onClick={onClose} />
      <div className="relative w-full sm:w-[440px] h-full overflow-y-auto" style={{ background: C.bgPanel, borderLeft: `1px solid ${C.borderStrong}` }}>
        <div className="sticky top-0 z-10 flex items-start justify-between px-5 py-4" style={{ background: C.bgPanel, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>EE {emp.ee}</div>
            <div className="text-lg font-semibold" style={{ color: C.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{emp.name}</div>
            <div className="text-sm mt-0.5" style={{ color: C.textSecondary }}>{emp.pos}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: C.textMuted }}><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <button onClick={() => onEdit(emp)} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md" style={{ background: C.surface, color: C.textSecondary, border: `1px solid ${C.border}` }}>
              <SquarePen size={13} /> Edit details
            </button>
            <ConfirmButton
              onConfirm={() => onDelete(emp.id)}
              label="Delete employee" confirmLabel="Click to confirm delete"
              Icon={Trash2}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md"
              style={{ background: C.surface, color: C.overdue, border: `1px solid ${C.border}` }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: C.surface, color: C.textSecondary }}>{emp.bl}</span>
            <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: C.surface, color: C.textSecondary }}>{emp.nat}</span>
            <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: C.surface, color: C.textSecondary }}>{localExpatOf(emp.nat)}</span>
            <span className="px-2 py-1 rounded-md text-xs font-medium" style={{ background: C.surface, color: C.textSecondary }}>{emp.rot}</span>
          </div>

          <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>Status as of {formatDateShort(latest.date)}</span>
              <AlertPill alert={latest.alert} />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <CategoryTag category={latest.category} />
              <span className="text-xs" style={{ color: C.textMuted }}>({latest.status || "no code"})</span>
            </div>
            <RotationGauge phase={latest.phase} consecutive={latest.consecutive} limit={latest.phase === "OFF" ? latest.offDays : latest.workDays} alert={latest.alert} size="lg" />
            <div className="text-xs mt-3 leading-relaxed" style={{ color: C.textSecondary }}>{latest.trigger}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: C.textMuted }}>Joining Date</div>
              <div className="text-sm font-medium" style={{ color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{emp.sen || "\u2014"}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: C.textMuted }}>Leave Balance c/f</div>
              <div className="text-sm font-medium" style={{ color: emp.bal < 0 ? C.critical : C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{emp.bal} days</div>
            </div>
          </div>

          {monthly.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="text-[11px] uppercase tracking-wider font-medium mb-3" style={{ color: C.textMuted }}>Days by category (loaded window)</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={monthly} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={78} tick={{ fill: C.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ fill: C.surfaceHover }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                    {monthly.map((m, i) => <Cell key={i} fill={m.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>Daily timeline</span>
              <button onClick={() => setEditMode((v) => !v)} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md"
                style={{ background: editMode ? "#5B9BD5" : C.surface, color: editMode ? "#0A0E13" : C.textSecondary, border: `1px solid ${editMode ? "#5B9BD5" : C.border}` }}>
                <Pencil size={11} /> {editMode ? "Done editing" : "Edit attendance"}
              </button>
            </div>
            {editMode && (
              <div className="text-[11px] mb-2 leading-relaxed" style={{ color: C.textMuted }}>
                Tap a day to set its status. Saves straight to the database.
              </div>
            )}
            <MonthCalendar timeline={timeline} editable={editMode} onChangeDay={(date, status) => onEditDay(emp.id, date, status)} />
          </div>
        </div>
      </div>
    </div>
  );
}
