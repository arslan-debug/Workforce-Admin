import React, { useEffect, useState } from "react";
import { X, Plus, Save } from "lucide-react";
import { C } from "./lib.js";

const BLANK_FORM = { ee: "", name: "", pos: "", nat: "", bl: "", rot: "", sen: "", bal: "" };

export default function EmployeeModal({ open, employee, onClose, onSubmit, natOptions, posOptions, blOptions, error }) {
  const [form, setForm] = useState(BLANK_FORM);
  const isEdit = !!employee;

  useEffect(() => {
    if (!open) return;
    setForm(
      employee
        ? { ee: employee.ee, name: employee.name, pos: employee.pos, nat: employee.nat, bl: employee.bl, rot: employee.rot, sen: employee.sen, bal: String(employee.bal ?? 0) }
        : BLANK_FORM
    );
  }, [open, employee]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inputStyle = { background: C.bgPanel, border: `1px solid ${C.border}`, color: C.textPrimary, width: "100%" };
  const field = (label, key, opts) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>
        {label}{opts?.required !== false && <span style={{ color: C.overdue }}> *</span>}
      </span>
      {opts?.list ? (
        <>
          <input list={key + "-list"} value={form[key]} onChange={set(key)} className="px-2.5 py-1.5 rounded-md text-sm outline-none" style={inputStyle} placeholder={opts.placeholder} disabled={opts.lockedOnEdit && isEdit} />
          <datalist id={key + "-list"}>{opts.list.map((o) => <option key={o} value={o} />)}</datalist>
        </>
      ) : opts?.type === "date" ? (
        <input type="date" value={form[key]} onChange={set(key)} className="px-2.5 py-1.5 rounded-md text-sm outline-none" style={inputStyle} />
      ) : (
        <input type={opts?.type || "text"} value={form[key]} onChange={set(key)} className="px-2.5 py-1.5 rounded-md text-sm outline-none" style={inputStyle} placeholder={opts?.placeholder} disabled={opts?.lockedOnEdit && isEdit} />
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(3,5,8,0.65)" }} onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: C.bgPanel, border: `1px solid ${C.borderStrong}` }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-semibold" style={{ color: C.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{isEdit ? "Edit Employee" : "Add Employee"}</span>
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: C.textMuted }}><X size={16} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form, employee?.id); }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field("Employee Number", "ee", { placeholder: "e.g. 0921", lockedOnEdit: true })}
          {field("Name", "name", { placeholder: "Full name" })}
          {field("Designation", "pos", { list: posOptions, placeholder: "e.g. Equipment Operator" })}
          {field("Rotation Cycle", "rot", { list: ["4x2", "2x1", "3x1", "45x30", "PERM"], placeholder: "e.g. 4x2" })}
          {field("Joining Date", "sen", { type: "date" })}
          {field("Nationality", "nat", { list: natOptions, placeholder: "e.g. Pakistan", required: false })}
          {field("Business Line", "bl", { list: blOptions, placeholder: "e.g. WIS", required: false })}
          {field("Leave Balance (days)", "bal", { type: "number", placeholder: "0", required: false })}
          {error && <div className="sm:col-span-2 text-xs px-3 py-2 rounded-md" style={{ background: C.overdue + "16", color: C.overdue, border: `1px solid ${C.overdue}40` }}>{error}</div>}
          <div className="sm:col-span-2 flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-lg text-sm font-medium" style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>Cancel</button>
            <button type="submit" className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium" style={{ background: "#5B9BD5", color: "#0A0E13" }}>
              {isEdit ? <Save size={15} /> : <Plus size={15} />} {isEdit ? "Save Changes" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
