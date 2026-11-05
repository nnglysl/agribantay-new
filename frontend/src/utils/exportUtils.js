import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { manilaDay } from './reportPeriod'

/**
 * Exports an array of row objects to a CSV file and triggers a browser
 * download. Used by every report module so CSV output stays identical
 * in formatting (quoting, escaping, filename pattern) regardless of
 * which report generated it.
 *
 * @param {Array<Object>} rows - data rows, one object per row
 * @param {Array<{key: string, label: string}>} columns - column order + headers
 * @param {string} filename - e.g. "AgriBantay_Report_2026-07-15.csv"
 */
export function exportToCSV(rows, columns, filename) {
  const escapeCell = (value) => {
    let str = value === null || value === undefined ? '' : String(value)
    // Spreadsheet-facing text must not become a formula. Keep actual numeric
    // values numeric; neutralize text, including whitespace/full-width prefixes.
    const unsafeText = typeof value === 'string' && (/^[\t\r\n]/.test(str) || /^\s*[=+\-@＝＋－＠]/u.test(str))
    if (unsafeText) str = `\t${str}`
    // Quote protected text and all CSV separators, including a lone CR.
    if (unsafeText || /[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headerRow = columns.map(c => escapeCell(c.label)).join(',')
  const bodyRows = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','))
  const csvContent = [headerRow, ...bodyRows].join('\r\n')

  // Prepend a UTF-8 BOM so Excel opens accented/peso characters correctly.
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Renders the given print-view ref to a paginated A4 PDF and downloads
 * it. Shared by every report module so PDF layout, margins, and
 * pagination behavior are identical everywhere — a fix or tweak here
 * applies to all reports at once instead of drifting between copies.
 *
 * @param {React.RefObject} printRef - ref to the offscreen "print-view" node
 * @param {string} filename - e.g. "AgriBantay_Report_2026-07-15.pdf"
 */
export async function exportPrintRefToPDF(printRef, filename) {
  if (!printRef?.current) return

  const canvas = await html2canvas(printRef.current, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF('p', 'mm', 'a4')
  const margin = 12
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2
  const imgWidth = usableWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = margin

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
  heightLeft -= usableHeight

  while (heightLeft > 0) {
    position = margin - (imgHeight - heightLeft)
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= usableHeight
  }

  pdf.save(filename)
}

/** Report filenames use the same Manila calendar date as their contents. */
export function todayStamp(date = new Date()) {
  return manilaDay(date)
}
