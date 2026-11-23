// CSV for spreadsheets (issue #248): UTF-8 with a byte order mark so Excel reads Korean text, CRLF line
// ends, and cells that a spreadsheet could run as a formula neutralized.

const byteOrderMark = '﻿';

// A cell that starts with one of these is a formula to Excel and Sheets. A leading apostrophe makes it
// text (OWASP "CSV injection"); tab and carriage return are included because some programs trim them.
const formulaStart = /^[=+\-@\t\r]/;

export type CsvValue = string | number | boolean | Date | null | undefined;

export function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return '';
  // Only text can be a formula: a number such as -3 stays a number.
  const text =
    typeof value === 'string'
      ? formulaStart.test(value)
        ? `'${value}`
        : value
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `${byteOrderMark}${lines.join('\r\n')}\r\n`;
}
