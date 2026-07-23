import * as XLSX from "xlsx";

export function createXlsxWorkbook(
  rows: Record<string, string | number | null | undefined>[],
): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(
    rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v ?? ""]),
      ),
    ),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  return wb;
}

export function exportToXlsx(
  rows: Record<string, string | number | null | undefined>[],
  filename: string,
) {
  XLSX.writeFile(createXlsxWorkbook(rows), `${filename}.xlsx`);
}
