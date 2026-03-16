import * as XLSX from "xlsx";

export function exportToXlsx(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
) {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v ?? ""]),
      ),
    ),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
