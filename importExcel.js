import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient.js";

/* ============================================================================
   Supports TWO source formats:

   1. "Live Monthly Attendance" master file \u2014 one sheet per month (e.g.
      "Jan-26", "September-26"), each with its own header row and day-number
      columns (1, 2, 3\u2026), spanning years of history. We only pull sheets
      from January 2026 onward, and merge each employee's records across all
      matching months into one continuous attendance history.

   2. The original single-sheet "DATA" format (fixed columns + one column per
      full date, e.g. "01-Mar-26, Sun") \u2014 kept as a fallback for the older
      file shape.

   Both funnel into the same {dateList, employees} shape the app expects.
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
  assignement: "asn", assignment: "asn", department: "asn",
  rotation: "rot", "rotation cycle": "rot",
  "bal carry forward": "bal",
};
const REQUIRED_FIELDS = [
  ["ee", "Employee Number"], ["name", "Name"], ["pos", "Designation"],
  ["rot", "Rotation Cycle"], ["sen", "Joining Date"],
];

// Attendance codes that are used as-is, no color logic involved.
const KNOWN_SHORT_CODES = new Set([
  "SB", "WE", "DO", "V", "RTD", "TD", "PH", "LOA", "SL",
  "T", "BT", "HQ", "STB", "WFH", "QD", "SJ", "SJF",
]);
// The one stable signal across the file's history: this green fill means
// "on a job site, no food allowance needed" (Aramco provides food).
// Any other fill on an unrecognized (site-code) cell means SJF \u2014 food
// allowance needed. No fill at all defaults to plain SJ, per instructions.
const GREEN_FILL_SUFFIX = "92D050";

function resolveDayStatus(cell) {
  if (cell == null || cell.v == null) return "";
  const raw = String(cell.v).trim().toUpperCase();
  if (raw === "") return "";
  if (KNOWN_SHORT_CODES.has(raw)) return raw;
  const rgb = cell.s?.fgColor?.rgb ? String(cell.s.fgColor.rgb).toUpperCase() : "";
  if (!rgb) return "SJ";
  if (rgb.endsWith(GREEN_FILL_SUFFIX)) return "SJ";
  return "SJF";
}

const MONTH_NAME_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
function parseSheetMonthYear(sheetName) {
  const cleaned = sheetName.trim().toLowerCase();
  const m = cleaned.match(/^([a-z]+)[\s-]*'?\s*(\d{2,4})/);
  if (!m) return null;
  const monthIdx = MONTH_NAME_MAP[m[1]];
  if (monthIdx === undefined) return null;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return { year, month: monthIdx };
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

/* ---------------------------------------------------------------------------
   Format 1: multi-sheet "Live Monthly Attendance" master file
   ------------------------------------------------------------------------ */
function parseMultiMonthWorkbook(wb, fromYear = 2026, fromMonth = 0) {
  const monthSheets = wb.SheetNames
    .map((name) => ({ name, my: parseSheetMonthYear(name) }))
    .filter((s) => s.my && (s.my.year > fromYear || (s.my.year === fromYear && s.my.month >= fromMonth)))
    .sort((a, b) => a.my.year - b.my.year || a.my.month - b.my.month);
  if (monthSheets.length === 0) return null;

  const employeesByEe = new Map();
  let sawAnyRow = false;
  let missingFieldsBestAttempt = null;

  for (const { name, my } of monthSheets) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(grid.length, 10); r++) {
      const row = grid[r] || [];
      if (row.some((c) => typeof c === "string" && c.trim().toLowerCase() === "ee number")) { headerRowIdx = r; break; }
    }
    if (headerRowIdx < 0) continue;
    const headerRow = grid[headerRowIdx];
    const colMeta = headerRow.map((cell) => {
      const key = typeof cell === "string" ? cell.trim().toLowerCase() : null;
      if (key && FIXED_MAP[key]) return { type: "fixed", field: FIXED_MAP[key] };
      if (typeof cell === "number" && cell >= 1 && cell <= 31) return { type: "day", day: cell };
      return { type: "skip" };
    });
    const foundFields = new Set(colMeta.filter((cm) => cm.type === "fixed").map((cm) => cm.field));
    const missing = REQUIRED_FIELDS.filter(([f]) => !foundFields.has(f)).map(([, label]) => label);
    if (missing.length > 0) {
      if (!missingFieldsBestAttempt || missing.length < missingFieldsBestAttempt.missing.length) {
        missingFieldsBestAttempt = { sheetName: name, missing };
      }
      continue;
    }
    const daysInMonth = new Date(Date.UTC(my.year, my.month + 1, 0)).getUTCDate();

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const dataRow = grid[r] || [];
      const rec = { ee: "", name: "", pos: "", nat: "", bl: "", cls: "", asn: "", rot: "", sen: "" };
      let hasName = false;
      colMeta.forEach((cm, ci) => {
        if (cm.type !== "fixed") return;
        const val = dataRow[ci];
        if (cm.field === "sen") rec.sen = fmtCellDate(val);
        else if (cm.field === "ee") rec.ee = typeof val === "number" ? String(val).padStart(4, "0") : val == null ? "" : String(val).trim();
        else rec[cm.field] = val == null ? "" : String(val).trim();
        if (cm.field === "name" && rec.name) hasName = true;
      });
      if (!hasName || !rec.ee || /temporary/i.test(rec.name)) continue;

      if (!employeesByEe.has(rec.ee)) employeesByEe.set(rec.ee, { ...rec, daysMap: new Map() });
      const stored = employeesByEe.get(rec.ee);
      Object.assign(stored, { name: rec.name, pos: rec.pos, nat: rec.nat, bl: rec.bl, cls: rec.cls, asn: rec.asn, rot: rec.rot, sen: rec.sen || stored.sen });

      colMeta.forEach((cm, ci) => {
        if (cm.type !== "day" || cm.day > daysInMonth) return;
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        const status = resolveDayStatus(cell);
        const iso = `${my.year}-${String(my.month + 1).padStart(2, "0")}-${String(cm.day).padStart(2, "0")}`;
        stored.daysMap.set(iso, status);
      });
      sawAnyRow = true;
    }
  }

  if (!sawAnyRow) {
    if (missingFieldsBestAttempt) throw new Error(`Found a monthly sheet ("${missingFieldsBestAttempt.sheetName}") but it's missing required column(s): ${missingFieldsBestAttempt.missing.join(", ")}.`);
    return null;
  }

  const allDates = new Set();
  employeesByEe.forEach((e) => e.daysMap.forEach((_, d) => allDates.add(d)));
  const dateList = [...allDates].sort();
  const employees = [...employeesByEe.values()].map((e) => {
    const daysArr = dateList.map((d) => e.daysMap.get(d) || "");
    const { daysMap, ...rest } = e;
    return { ...rest, bal: 0, daysArr };
  });
  return { dateList, employees };
}

/* ---------------------------------------------------------------------------
   Format 2 (fallback): original single "DATA" sheet, one column per date
   ------------------------------------------------------------------------ */
const MONTHS_ABBR_MAP = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseHeaderDate(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.split(",")[0].trim();
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS_ABBR_MAP[m[2].toLowerCase()];
  if (mon === undefined) return null;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function parseSingleSheetWorkbook(wb) {
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
      const missing = [...missingFields, ...(dateColIdx.length === 0 ? ["daily attendance columns"] : [])];
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
        dateColIdx.forEach((ci) => {
          const cell = ws[XLSX.utils.encode_cell({ r: dr, c: ci })];
          rawDays.push(resolveDayStatus(cell));
        });
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

export function parseWorkbook(wb) {
  const multi = parseMultiMonthWorkbook(wb);
  if (multi) return multi;
  return parseSingleSheetWorkbook(wb);
}

/** Upserts parsed employees + their full attendance history into Supabase. */
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
  const CHUNK = 1000;
  for (let i = 0; i < attendanceRows.length; i += CHUNK) {
    const chunk = attendanceRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("attendance").upsert(chunk, { onConflict: "employee_id,date" });
    if (error) throw new Error(`Could not save attendance rows: ${error.message}`);
    onProgress?.(`Saving attendance history\u2026 (${Math.min(i + CHUNK, attendanceRows.length)}/${attendanceRows.length})`);
  }
  return { employeeCount: savedEmployees.length, attendanceCount: attendanceRows.length };
}
