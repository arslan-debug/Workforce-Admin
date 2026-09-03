import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient.js";

/* ============================================================================
   Parses a workbook shaped like the original "DATA" sheet: fixed employee
   columns + one column per day. Same validated logic as the file-upload
   version of this dashboard, kept here as a one-time/occasional bulk-import
   path — the admin panel itself is the everyday way to add/edit records.
   ========================================================================= */
const FIXED_MAP = {
  "s.no": "sno", sno: "sno",
  "ee number": "ee", eenumber: "ee", "employee number": "ee", "employee no": "ee", "emp number": "ee", "emp no": "ee", "employee no.": "ee",
  "business line": "bl",
  "employee class": "cls",
  "employee name": "name", name: "name",
  position: "pos", designation: "pos",
  nationality: "nat",
  "seniority date": "sen", "joining date": "sen", "date of joining": "sen",
  assignement: "asn", assignment: "asn",
  rotation: "rot", "rotation cycle": "rot",
  "bal carry forward": "bal",
};
const REQUIRED_FIELDS = [
  ["ee", "Employee Number"], ["name", "Name"], ["pos", "Designation"],
  ["rot", "Rotation Cycle"], ["sen", "Joining Date"],
];
const MONTHS_MAP = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function parseHeaderDate(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.split(",")[0].trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS_MAP[m[2].toLowerCase()];
  if (mon === undefined) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function fmtCellDate(val) {
  if (val instanceof Date) return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, "0")}-${String(val.getUTCDate()).padStart(2, "0")}`;
  if (typeof val === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + val * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return val == null ? "" : String(val).trim();
}

export function parseWorkbook(wb) {
  let bestAttempt = null;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    for (let r = 0; r < Math.min(grid.length, 40); r++) {
      const row = grid[r] || [];
      const hasNameCol = row.some((c) => {
        if (typeof c !== "string") return false;
        const k = c.trim().toLowerCase();
        return k === "employee name" || k === "name";
      });
      if (!hasNameCol) continue;

      const colMeta = row.map((cell) => {
        const key = typeof cell === "string" ? cell.trim().toLowerCase() : null;
        if (key && FIXED_MAP[key]) return { type: "fixed", field: FIXED_MAP[key] };
        const iso = parseHeaderDate(cell);
        if (iso) return { type: "date", date: iso };
        return { type: "skip" };
      });
      const foundFields = new Set(colMeta.filter((cm) => cm.type === "fixed").map((cm) => cm.field));
      const missingFields = REQUIRED_FIELDS.filter(([f]) => !foundFields.has(f)).map(([, label]) => label);
      const dateColIdx = colMeta.map((cm, i) => (cm.type === "date" ? i : -1)).filter((i) => i >= 0);
      const missing = [...missingFields, ...(dateColIdx.length === 0 ? ["daily attendance columns (e.g. '01-Jan-26')"] : [])];
      if (missing.length > 0) {
        if (!bestAttempt || missing.length < bestAttempt.missing.length) bestAttempt = { sheetName, missing };
        continue;
      }

      const order = [...dateColIdx].sort((a, b) => (colMeta[a].date < colMeta[b].date ? -1 : colMeta[a].date > colMeta[b].date ? 1 : 0));
      const sortedDateList = order.map((i) => colMeta[i].date);
      const employees = [];
      for (let dr = r + 1; dr < grid.length; dr++) {
        const dataRow = grid[dr] || [];
        const rec = { ee: "", name: "", pos: "", nat: "", bl: "", cls: "", asn: "", rot: "", sen: "", bal: 0 };
        const rawDays = [];
        let hasName = false;
        colMeta.forEach((cm, ci) => {
          const val = dataRow[ci];
          if (cm.type === "fixed") {
            if (cm.field === "bal") rec.bal = typeof val === "number" ? val : parseFloat(val) || 0;
            else if (cm.field === "sen") rec.sen = fmtCellDate(val);
            else if (cm.field === "ee") rec.ee = typeof val === "number" ? String(val).padStart(4, "0") : val == null ? "" : String(val).trim();
            else rec[cm.field] = val == null ? "" : String(val).trim();
            if (cm.field === "name" && rec.name) hasName = true;
          }
        });
        dateColIdx.forEach((ci) => rawDays.push(dataRow[ci] == null ? "" : String(dataRow[ci]).trim().toUpperCase()));
        if (hasName && !/temporary/i.test(rec.name)) {
          rec.daysArr = order.map((oi) => rawDays[dateColIdx.indexOf(oi)]);
          employees.push(rec);
        }
      }
      if (employees.length > 0) return { dateList: sortedDateList, employees };
      if (!bestAttempt) bestAttempt = { sheetName, missing: ["employee rows below the header row"] };
    }
  }
  if (bestAttempt) throw new Error(`Found a roster sheet ("${bestAttempt.sheetName}") but it's missing required column(s): ${bestAttempt.missing.join(", ")}.`);
  return null;
}

/** Upserts parsed employees + their full attendance history into Supabase.
 *  Safe to re-run: employees match on ee_number, attendance on (employee, date). */
export async function importToSupabase(parsed, onProgress) {
  onProgress?.("Saving employee records\u2026");
  const employeeRows = parsed.employees.map((e) => ({
    ee_number: e.ee, name: e.name, designation: e.pos, nationality: e.nat,
    business_line: e.bl, employee_class: e.cls, assignment: e.asn,
    rotation_cycle: e.rot, joining_date: e.sen || null, leave_balance: e.bal,
  }));
  const { data: savedEmployees, error: empError } = await supabase
    .from("employees")
    .upsert(employeeRows, { onConflict: "ee_number" })
    .select("id, ee_number");
  if (empError) throw new Error(`Could not save employees: ${empError.message}`);

  const idByEe = new Map(savedEmployees.map((e) => [e.ee_number, e.id]));
  onProgress?.("Saving attendance history\u2026");
  const attendanceRows = [];
  parsed.employees.forEach((e) => {
    const employeeId = idByEe.get(e.ee);
    if (!employeeId) return;
    parsed.dateList.forEach((date, i) => {
      const status = (e.daysArr[i] || "").trim().toUpperCase();
      if (status) attendanceRows.push({ employee_id: employeeId, date, status_code: status });
    });
  });
  // Batch in chunks so one request stays a reasonable size.
  const CHUNK = 1000;
  for (let i = 0; i < attendanceRows.length; i += CHUNK) {
    const chunk = attendanceRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("attendance").upsert(chunk, { onConflict: "employee_id,date" });
    if (error) throw new Error(`Could not save attendance rows: ${error.message}`);
    onProgress?.(`Saving attendance history\u2026 (${Math.min(i + CHUNK, attendanceRows.length)}/${attendanceRows.length})`);
  }
  return { employeeCount: savedEmployees.length, attendanceCount: attendanceRows.length };
}
