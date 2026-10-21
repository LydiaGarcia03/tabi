/** Saves a generated file through the browser (Downloads on PC, Files/share on phones). */
export function downloadFile(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before releasing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "Japan 2028" + "day-3" → "japan-2028-day-3". */
export function fileSlug(...parts: string[]): string {
  return (
    parts
      .join(' ')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'trip'
  )
}
