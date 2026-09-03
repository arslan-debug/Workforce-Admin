import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Calendar, Users, Search, Upload, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  AlertTriangle, Activity, BarChart3, MapPin, Plus, Wallet, LogOut, Loader2,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { supabase } from "./supabaseClient.js";
import {
  C, CATEGORY_META, ALERT_META, buildTimeline, formatDateLabel, formatDateShort, localExpatOf,
  uniqueSorted, buildDateWindow, groupDatesByMonth, todayIso,
} from "./lib.js";
import { KpiCard, TabButton, SlicerSelect, ThemedTooltip, AlertPill, RotationGauge } from "./components.jsx";
import EmployeeDrawer from "./EmployeeDrawer.jsx";
import EmployeeModal from "./EmployeeModal.jsx";
import Login from "./Login.jsx";
import { parseWorkbook, importToSupabase } from "./importExcel.js";

const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.borderStrong}; border-radius: 999px; }
  select option { background: ${C.bgPanel}; color: ${C.textPrimary}; }
  @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  .pulse-dot { animation: pulseDot 1.6s ease-in-out infinite; }
  button { font-family: inherit; }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }
`;

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [employeesRaw, setEmployeesRaw] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ nat: "ALL", pos: "ALL", rot: "ALL", loc: "ALL", bl: "ALL" });
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [alertFilter, setAlertFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formError, setFormError] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  // ---- Auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const dateList = useMemo(() => buildDateWindow(selectedDate, 120, 60), [selectedDate]);
  const windowStart = dateList[0];
  const windowEnd = dateList[dateList.length - 1];

  async function reloadEmployees() {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (error) { setDataError(error.message); return; }
    setEmployeesRaw(
      (data || []).map((r) => ({
        id: r.id, ee: r.ee_number, name: r.name, pos: r.designation, nat: r.nationality || "",
        bl: r.business_line || "", cls: r.employee_class || "", asn: r.assignment || "",
        rot: r.rotation_cycle, sen: r.joining_date, bal: r.leave_balance ?? 0,
      }))
    );
  }
  async function reloadAttendance() {
    const { data, error } = await supabase.from("attendance").select("employee_id,date,status_code").gte("date", windowStart).lte("date", windowEnd);
    if (error) { setDataError(error.message); return; }
    setAttendanceRows(data || []);
  }

  // Load employees once we're authenticated. Also default the selected date
  // to the most recent date that actually has attendance data, rather than
  // always jumping to today's real calendar date \u2014 otherwise, right after
  // importing historical data (or if a day gets missed), the dashboard would
  // show a wall of zeros even though the data is there, just elsewhere.
  useEffect(() => {
    if (!session) return;
    setLoadingData(true);
    setDataError(null);
    (async () => {
      await reloadEmployees();
      const { data: latest, error } = await supabase
        .from("attendance").select("date").order("date", { ascending: false }).limit(1);
      const latestDate = !error && latest && latest[0]?.date;
      if (latestDate && latestDate < todayIso()) {
        setSelectedDate(latestDate); // triggers the window-reload effect below
      } else {
        await reloadAttendance();
      }
      setLoadingData(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  useEffect(() => {
    if (!session) return;
    reloadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowStart, windowEnd]);

  // Join employees + attendance into the same shape the pipeline expects,
  // then run the (unchanged, previously-verified) rotation/alert pipeline.
  const employees = useMemo(() => {
    const byEmpDate = new Map();
    attendanceRows.forEach((r) => byEmpDate.set(`${r.employee_id}|${r.date}`, r.status_code));
    return employeesRaw.map((e) => {
      const daysArr = dateList.map((d) => byEmpDate.get(`${e.id}|${d}`) || "");
      return { ...e, daysArr, timeline: buildTimeline(daysArr, dateList, e.rot), localExpat: localExpatOf(e.nat) };
    });
  }, [employeesRaw, attendanceRows, dateList]);

  const selectedDateIdx = dateList.indexOf(selectedDate);
  const todayRows = useMemo(
    () => employees.map((e) => ({ ...e, today: e.timeline[selectedDateIdx] || e.timeline[e.timeline.length - 1] })),
    [employees, selectedDateIdx]
  );

  const kpis = useMemo(() => {
    const counts = {};
    Object.keys(CATEGORY_META).forEach((k) => (counts[k] = 0));
    todayRows.forEach((e) => (counts[e.today.category] = (counts[e.today.category] || 0) + 1));
    return counts;
  }, [todayRows]);

  const statusSummary = useMemo(() => {
    let active = 0, onLeave = 0, sick = 0;
    todayRows.forEach((e) => {
      const cat = e.today.category;
      if (cat === "SICK_LEAVE") sick++; else if (cat === "DAYS_OFF") onLeave++; else active++;
    });
    return [{ name: "Active", value: active, fill: "#5B9BD5" }, { name: "On Leave", value: onLeave, fill: "#3DDC97" }, { name: "Sick Leave", value: sick, fill: "#E8637A" }];
  }, [todayRows]);
  const fieldVsBase = useMemo(() => ([
    { name: "Field-based", value: kpis.ON_PROJECT || 0, fill: "#E8A33D" },
    { name: "Saudi-based", value: kpis.SAUDI_BASE || 0, fill: "#5B9BD5" },
  ]), [kpis]);

  const alerts = useMemo(
    () => todayRows.filter((e) => e.today.alert !== "OK").sort((a, b) => ALERT_META[a.today.alert].rank - ALERT_META[b.today.alert].rank || a.today.daysRemaining - b.today.daysRemaining),
    [todayRows]
  );

  const filterOptions = useMemo(() => ({
    nat: uniqueSorted(employees.map((e) => e.nat)),
    pos: uniqueSorted(employees.map((e) => e.pos)),
    rot: uniqueSorted(employees.map((e) => e.rot.toUpperCase())),
    bl: uniqueSorted(employees.map((e) => e.bl)),
  }), [employees]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = todayRows.filter((e) => {
      if (filters.nat !== "ALL" && e.nat !== filters.nat) return false;
      if (filters.pos !== "ALL" && e.pos !== filters.pos) return false;
      if (filters.rot !== "ALL" && e.rot.toUpperCase() !== filters.rot) return false;
      if (filters.bl !== "ALL" && e.bl !== filters.bl) return false;
      if (filters.loc !== "ALL" && e.localExpat !== filters.loc) return false;
      if (q && !(e.name.toLowerCase().includes(q) || e.ee.toLowerCase().includes(q) || e.pos.toLowerCase().includes(q))) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let av, bv;
      if (sortKey === "daysRemaining") { av = a.today.daysRemaining ?? 999; bv = b.today.daysRemaining ?? 999; }
      else if (sortKey === "alert") { av = ALERT_META[a.today.alert].rank; bv = ALERT_META[b.today.alert].rank; }
      else { av = String(a[sortKey] ?? "").toLowerCase(); bv = String(b[sortKey] ?? "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [todayRows, filters, search, sortKey, sortDir]);

  const analyticsData = useMemo(() => {
    const base = filteredRows.length ? filteredRows : todayRows;
    const by = (fn) => {
      const m = new Map();
      base.forEach((e) => { const k = fn(e); m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    const rotColors = { "4X2": "#5B9BD5", "2X1": "#E8A33D", "3X1": "#9B7EDE", "45X30": "#3DDC97", PERM: "#6B7785" };
    return {
      byPosition: by((e) => e.pos),
      byNationality: by((e) => e.nat),
      byRotation: by((e) => e.rot.toUpperCase()).map((d) => ({ ...d, fill: rotColors[d.name] || "#A68A64" })),
      byLocalExpat: by((e) => e.localExpat).map((d) => ({ ...d, fill: d.name === "Local" ? "#3DDC97" : "#5B9BD5" })),
    };
  }, [filteredRows, todayRows]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  function clearFilters() { setFilters({ nat: "ALL", pos: "ALL", rot: "ALL", loc: "ALL", bl: "ALL" }); setSearch(""); }

  // ---- CRUD handlers ----
  async function handleSaveEmployee(form, editingId) {
    const missing = [];
    if (!form.ee.trim()) missing.push("Employee Number");
    if (!form.name.trim()) missing.push("Name");
    if (!form.pos.trim()) missing.push("Designation");
    if (!form.rot.trim()) missing.push("Rotation Cycle");
    if (!form.sen.trim()) missing.push("Joining Date");
    if (missing.length) { setFormError(`Required: ${missing.join(", ")}.`); return; }

    const row = {
      ee_number: form.ee.trim(), name: form.name.trim(), designation: form.pos.trim(),
      nationality: form.nat.trim(), business_line: form.bl.trim(), rotation_cycle: form.rot.trim(),
      joining_date: form.sen, leave_balance: parseFloat(form.bal) || 0,
    };
    const query = editingId ? supabase.from("employees").update(row).eq("id", editingId) : supabase.from("employees").insert([row]);
    const { error } = await query;
    if (error) {
      setFormError(error.code === "23505" ? `Employee Number "${row.ee_number}" is already in use.` : error.message);
      return;
    }
    setFormError(null);
    setModalOpen(false);
    setEditingEmployee(null);
    reloadEmployees();
  }
  async function handleDeleteEmployee(id) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { setDataError(error.message); return; }
    setSelectedEmpId(null);
    reloadEmployees();
  }
  async function handleEditDay(employeeId, date, status) {
    // Optimistic local update so the calendar feels instant.
    setAttendanceRows((prev) => {
      const next = prev.filter((r) => !(r.employee_id === employeeId && r.date === date));
      next.push({ employee_id: employeeId, date, status_code: status });
      return next;
    });
    const { error } = await supabase.from("attendance").upsert({ employee_id: employeeId, date, status_code: status }, { onConflict: "employee_id,date" });
    if (error) { setDataError(error.message); reloadAttendance(); }
  }
  async function handleImportFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportStatus("Reading file\u2026");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const parsed = parseWorkbook(wb);
      if (!parsed) throw new Error('No roster sheet found. Looking for a sheet with a "Name" or "Employee Name" column.');
      const result = await importToSupabase(parsed, setImportStatus);
      setImportStatus(`Done \u2014 ${result.employeeCount} employees, ${result.attendanceCount} attendance records saved.`);
      await Promise.all([reloadEmployees(), reloadAttendance()]);
    } catch (err) {
      setImportError(err.message || "Import failed.");
      setImportStatus(null);
    } finally {
      ev.target.value = "";
    }
  }
  function handleLogout() { supabase.auth.signOut(); }

  // ---- Auth gating ----
  if (session === undefined) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <Loader2 className="animate-spin" size={22} style={{ color: C.textMuted }} />
      </div>
    );
  }
  if (!session) return <Login />;

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) || null;
  const totalHeadcount = employees.length;
  const businessLines = uniqueSorted(employees.map((e) => e.bl)).join(" / ");

  const KPI_ROW = [
    { key: "ON_PROJECT", label: "On Project" }, { key: "SAUDI_BASE", label: "Saudi Base" },
    { key: "DAYS_OFF", label: "Days Off" }, { key: "TRAVEL", label: "Travel" },
    { key: "WEEKEND", label: "Weekend" }, { key: "SICK_LEAVE", label: "Sick Leave" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }} className="w-full">
      <style>{GLOBAL_STYLE}</style>

      <div className="sticky top-0 z-30 px-4 sm:px-6 py-4" style={{ background: C.bgPanel, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] font-semibold mb-1" style={{ color: "#5B9BD5" }}>Workforce Rotation</div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>Sprint Command Centre</h1>
            <div className="text-xs mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: C.textSecondary }}>
              <MapPin size={12} />
              <span>{businessLines || "\u2014"} \u00B7 Kingdom of Saudi Arabia \u00B7 {totalHeadcount} employees</span>
              {loadingData && <Loader2 className="animate-spin ml-1" size={12} />}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium" style={{ background: C.surface, color: C.textSecondary, border: `1px solid ${C.border}` }}>
              <Upload size={15} /> Import Excel
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleImportFile} className="hidden" />
            <button onClick={handleLogout} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium" style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>
              <LogOut size={15} /> Log out
            </button>
          </div>
        </div>

        {(importStatus || importError || dataError) && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={importError || dataError ? { background: C.overdue + "16", color: C.overdue, border: `1px solid ${C.overdue}40` } : { background: "#5B9BD516", color: "#5B9BD5", border: "1px solid #5B9BD540" }}>
            {importError || dataError || importStatus}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => { const i = dateList.indexOf(selectedDate); setSelectedDate(dateList[Math.max(0, i - 1)]); }}
            className="p-1.5 rounded-md" style={{ background: C.surface, color: C.textSecondary }}><ChevronLeft size={15} /></button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <Calendar size={13} style={{ color: C.textMuted }} />
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-xs font-medium outline-none cursor-pointer" style={{ color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
              {groupDatesByMonth(dateList).map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.items.map((d) => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button onClick={() => { const i = dateList.indexOf(selectedDate); setSelectedDate(dateList[Math.min(dateList.length - 1, i + 1)]); }}
            className="p-1.5 rounded-md" style={{ background: C.surface, color: C.textSecondary }}><ChevronRight size={15} /></button>
          <button onClick={() => setSelectedDate(todayIso())} className="text-xs font-medium px-2.5 py-1.5 rounded-md" style={{ color: "#5B9BD5" }}>Today</button>
        </div>

        <div className="flex items-center gap-1.5 mt-4 overflow-x-auto">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} label="Overview" Icon={Activity} />
          <TabButton active={tab === "alerts"} onClick={() => setTab("alerts")} label="Alerts" Icon={AlertTriangle} badge={alerts.length} />
          <TabButton active={tab === "employees"} onClick={() => setTab("employees")} label="Employees" Icon={Users} />
          <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")} label="Analytics" Icon={BarChart3} />
          <TabButton active={false} onClick={() => {}} label="Payroll" Icon={Wallet} disabled title="Field Bonus Engine \u2014 planned for a future phase" />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6">
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {KPI_ROW.map((k) => { const meta = CATEGORY_META[k.key]; return <KpiCard key={k.key} label={k.label} value={kpis[k.key] || 0} color={meta.color} Icon={meta.Icon} />; })}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3 rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2"><AlertTriangle size={15} style={{ color: C.warning }} /><span className="text-sm font-medium" style={{ color: C.textPrimary }}>Rotation Watch</span></div>
                  {alerts.length > 6 && <button onClick={() => setTab("alerts")} className="text-xs font-medium flex items-center gap-1" style={{ color: "#5B9BD5" }}>View all {alerts.length} <ChevronRight size={12} /></button>}
                </div>
                {alerts.length === 0 ? (
                  <div className="text-sm py-8 text-center" style={{ color: C.textMuted }}>No rotation alerts for this date. Everyone is within limits.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {alerts.slice(0, 6).map((e) => (
                      <button key={e.id} onClick={() => setSelectedEmpId(e.id)} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left w-full" style={{ background: C.bgPanel, border: `1px solid ${C.border}` }}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: C.textPrimary }}>{e.name}</div>
                          <div className="text-xs truncate" style={{ color: C.textMuted }}>{e.pos} \u00B7 {e.rot}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-semibold" style={{ color: ALERT_META[e.today.alert].color, fontFamily: "'JetBrains Mono', monospace" }}>
                            {e.today.daysRemaining > 0 ? `${e.today.daysRemaining}d` : `${Math.abs(e.today.daysRemaining)}d over`}
                          </span>
                          <AlertPill alert={e.today.alert} compact />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="lg:col-span-2 rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-4" style={{ color: C.textPrimary }}>Workforce Composition</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={analyticsData.byLocalExpat} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {analyticsData.byLocalExpat.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                  </Pie><Tooltip content={<ThemedTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1">
                  {analyticsData.byLocalExpat.map((d) => <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.fill }} />{d.name} ({d.value})</div>)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-1" style={{ color: C.textPrimary }}>Status Distribution</div>
                <div className="text-xs mb-3" style={{ color: C.textMuted }}>Active vs on leave vs sick, as of {formatDateShort(selectedDate)}</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={statusSummary} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {statusSummary.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                  </Pie><Tooltip content={<ThemedTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1 flex-wrap">
                  {statusSummary.map((d) => <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.fill }} />{d.name} ({d.value})</div>)}
                </div>
              </div>
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-1" style={{ color: C.textPrimary }}>Field-based vs Saudi-based</div>
                <div className="text-xs mb-3" style={{ color: C.textMuted }}>On project vs at base, as of {formatDateShort(selectedDate)}</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart><Pie data={fieldVsBase} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {fieldVsBase.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                  </Pie><Tooltip content={<ThemedTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1 flex-wrap">
                  {fieldVsBase.map((d) => <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.fill }} />{d.name} ({d.value})</div>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "alerts" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              {["ALL", "OVERDUE", "CRITICAL", "WARNING"].map((f) => (
                <button key={f} onClick={() => setAlertFilter(f)} className="px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{ background: alertFilter === f ? C.surfaceHover : "transparent", color: alertFilter === f ? C.textPrimary : C.textMuted, border: `1px solid ${alertFilter === f ? C.borderStrong : C.border}` }}>
                  {f === "ALL" ? `All (${alerts.length})` : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {alerts.filter((e) => {
                if (alertFilter === "ALL") return true;
                if (alertFilter === "OVERDUE") return e.today.alert === "OVERDUE" || e.today.alert === "RETURN_DUE";
                if (alertFilter === "CRITICAL") return e.today.alert === "CRITICAL" || e.today.alert === "RETURN_SOON";
                if (alertFilter === "WARNING") return e.today.alert === "WARNING";
                return true;
              }).map((e) => (
                <button key={e.id} onClick={() => setSelectedEmpId(e.id)} className="text-left rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5" style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${ALERT_META[e.today.alert].color}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium" style={{ color: C.textPrimary }}>{e.name}</span><span className="text-xs font-mono" style={{ color: C.textMuted }}>EE {e.ee}</span></div>
                    <div className="text-xs mt-0.5" style={{ color: C.textSecondary }}>{e.pos} \u00B7 {e.nat} \u00B7 {e.rot}</div>
                    <div className="text-xs mt-1.5" style={{ color: ALERT_META[e.today.alert].color }}>{e.today.trigger}</div>
                  </div>
                  <div className="flex items-center gap-4 sm:w-44 flex-shrink-0"><RotationGauge phase={e.today.phase} consecutive={e.today.consecutive} limit={e.today.phase === "OFF" ? e.today.offDays : e.today.workDays} alert={e.today.alert} /></div>
                  <AlertPill alert={e.today.alert} />
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "employees" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl p-4 flex flex-wrap items-end gap-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: C.textMuted }}>Search</span>
                <div className="relative">
                  <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.textMuted }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, EE#, designation\u2026" className="pl-7 pr-3 py-1.5 rounded-md text-xs outline-none" style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.textPrimary, minWidth: 180 }} />
                </div>
              </label>
              <SlicerSelect label="Nationality" value={filters.nat} onChange={(v) => setFilters((f) => ({ ...f, nat: v }))} options={filterOptions.nat} />
              <SlicerSelect label="Designation" value={filters.pos} onChange={(v) => setFilters((f) => ({ ...f, pos: v }))} options={filterOptions.pos} />
              <SlicerSelect label="Rotation" value={filters.rot} onChange={(v) => setFilters((f) => ({ ...f, rot: v }))} options={filterOptions.rot} />
              <SlicerSelect label="Business Line" value={filters.bl} onChange={(v) => setFilters((f) => ({ ...f, bl: v }))} options={filterOptions.bl} />
              <SlicerSelect label="Local / Expat" value={filters.loc} onChange={(v) => setFilters((f) => ({ ...f, loc: v }))} options={["Local", "Expat"]} />
              <button onClick={clearFilters} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{ color: C.textMuted, border: `1px solid ${C.border}` }}>Clear</button>
              <button onClick={() => { setEditingEmployee(null); setFormError(null); setModalOpen(true); }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md ml-auto" style={{ background: "#5B9BD5", color: "#0A0E13" }}>
                <Plus size={13} /> Add Employee
              </button>
              <span className="text-xs" style={{ color: C.textMuted }}>{filteredRows.length} of {employees.length}</span>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[["name", "Employee"], ["pos", "Designation"], ["nat", "Nationality"], ["rot", "Rotation"], ["daysRemaining", "Days Left"], ["alert", "Status"]].map(([key, label]) => (
                      <th key={key} onClick={() => toggleSort(key)} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium cursor-pointer select-none whitespace-nowrap" style={{ color: C.textMuted }}>
                        <span className="inline-flex items-center gap-1">{label}{sortKey === key && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredRows.map((e) => (
                      <tr key={e.id} onClick={() => setSelectedEmpId(e.id)} className="cursor-pointer" style={{ borderBottom: `1px solid ${C.border}` }}
                        onMouseEnter={(ev) => (ev.currentTarget.style.background = C.surfaceHover)} onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                        <td className="px-4 py-3"><div className="font-medium" style={{ color: C.textPrimary }}>{e.name}</div><div className="text-xs" style={{ color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>EE {e.ee}</div></td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.textSecondary }}>{e.pos}</td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.textSecondary }}>{e.nat}</td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: C.textSecondary }}>{e.rot}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium" style={{ color: e.today.daysRemaining != null ? ALERT_META[e.today.alert].color : C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{e.today.daysRemaining != null ? e.today.daysRemaining : "\u2014"}</td>
                        <td className="px-4 py-3"><AlertPill alert={e.today.alert} compact /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length === 0 && <div className="text-sm py-10 text-center" style={{ color: C.textMuted }}>{loadingData ? "Loading\u2026" : "No employees match these filters."}</div>}
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div className="flex flex-col gap-5">
            <div className="text-xs" style={{ color: C.textMuted }}>Composition reflects the full roster (and any Employees-tab filters), not a single date.</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-4" style={{ color: C.textPrimary }}>Headcount by Designation</div>
                <ResponsiveContainer width="100%" height={Math.max(280, analyticsData.byPosition.length * 24)}>
                  <BarChart data={analyticsData.byPosition} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fill: C.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ThemedTooltip />} cursor={{ fill: C.surfaceHover }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#5B9BD5" barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-4" style={{ color: C.textPrimary }}>Headcount by Nationality</div>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={analyticsData.byNationality} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: C.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ThemedTooltip />} cursor={{ fill: C.surfaceHover }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#E8A33D" barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-4" style={{ color: C.textPrimary }}>Rotation Pattern</div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart><Pie data={analyticsData.byRotation} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {analyticsData.byRotation.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                  </Pie><Tooltip content={<ThemedTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">{analyticsData.byRotation.map((d) => <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.fill }} /> {d.name} ({d.value})</div>)}</div>
              </div>
              <div className="rounded-xl p-4 sm:p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="text-sm font-medium mb-4" style={{ color: C.textPrimary }}>Local vs Expat</div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart><Pie data={analyticsData.byLocalExpat} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {analyticsData.byLocalExpat.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                  </Pie><Tooltip content={<ThemedTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">{analyticsData.byLocalExpat.map((d) => <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.fill }} /> {d.name} ({d.value})</div>)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedEmp && (
        <EmployeeDrawer
          emp={selectedEmp} dateList={dateList} onClose={() => setSelectedEmpId(null)} onEditDay={handleEditDay}
          onEdit={(emp) => { setEditingEmployee(emp); setFormError(null); setModalOpen(true); }}
          onDelete={handleDeleteEmployee}
        />
      )}
      <EmployeeModal
        open={modalOpen} employee={editingEmployee}
        onClose={() => { setModalOpen(false); setEditingEmployee(null); setFormError(null); }}
        onSubmit={handleSaveEmployee} error={formError}
        natOptions={filterOptions.nat} posOptions={filterOptions.pos} blOptions={filterOptions.bl}
      />
    </div>
  );
}
