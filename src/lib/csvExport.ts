/**
 * Utility for building high-quality, formatted CSV reports with metadata headers and structured sections.
 */

export interface CSVExportOptions {
  title: string;
  cafeName?: string;
  dateRangeStr?: string;
  summaryMetrics?: { label: string; value: string | number }[];
  headers: string[];
  rows: (string | number | undefined | null)[][];
  filename: string;
}

export function exportToCSV({
  title,
  cafeName = 'Gaming Cafe',
  dateRangeStr = new Date().toLocaleDateString(),
  summaryMetrics = [],
  headers,
  rows,
  filename
}: CSVExportOptions) {
  const sanitize = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines: string[] = [];

  // Metadata Header Block
  lines.push(`"=== ${title.toUpperCase()} ==="`);
  lines.push(`"Cafe:","${cafeName}"`);
  lines.push(`"Date / Period:","${dateRangeStr}"`);
  lines.push(`"Generated At:","${new Date().toLocaleString()}"`);

  if (summaryMetrics.length > 0) {
    lines.push('""');
    lines.push('"--- SUMMARY METRICS ---"');
    for (const metric of summaryMetrics) {
      lines.push(`"${metric.label}:",${sanitize(metric.value)}`);
    }
  }

  lines.push('""');
  lines.push('"--- DETAILED DATA LOGS ---"');
  lines.push(headers.map(sanitize).join(','));

  for (const row of rows) {
    lines.push(row.map(sanitize).join(','));
  }

  const csvString = lines.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
