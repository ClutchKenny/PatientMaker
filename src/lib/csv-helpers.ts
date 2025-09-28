import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export function readCsvAsObjects(filePath: string): Record<string, string>[] {
  const buf = fs.readFileSync(filePath);
  return parse(buf, { columns: true, skip_empty_lines: true });
}

export function writeObjectsAsCsv(
  filePath: string,
  rows: Record<string, any>[],
  columns?: string[]
) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const header =
    columns ??
    (rows.length > 0 ? Object.keys(rows[0]) : []); // if empty, write headers only
  const csv = stringify(rows, { header: true, columns: header });
  fs.writeFileSync(filePath, csv);
}
