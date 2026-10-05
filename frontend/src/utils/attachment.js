import api from '../api/axios'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIMES } from '../constants/serviceTypes'

export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return null
  const b = Number(bytes)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

export function fileTypeLabel(mime, name = '') {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF'
  if (mime === 'image/jpeg' || /\.jpe?g$/i.test(name)) return 'JPG'
  if (mime === 'image/png' || /\.png$/i.test(name)) return 'PNG'
  return mime || '—'
}

/**
 * Client-side check mirroring the backend rules (PDF/JPG/PNG, 5 MB). The
 * browser's MIME can be empty on some devices, so the extension is also
 * accepted; the server sniffs the real content either way.
 */
export function validateAttachment(file) {
  if (!file) return 'Please choose a file.'
  const extOk = /\.(pdf|jpe?g|png)$/i.test(file.name || '')
  const mimeOk = ATTACHMENT_MIMES.includes(file.type)
  if (!extOk && !mimeOk) return 'Only PDF, JPG or PNG files are accepted.'
  if (file.size > ATTACHMENT_MAX_BYTES) return 'The file must not be larger than 5 MB.'
  if (file.size === 0) return 'The selected file is empty.'
  return null
}

/**
 * The file lives on the private disk behind an authenticated endpoint, so
 * a plain <a href> cannot reach it (the token is not a cookie). Fetch it as
 * a blob and open it in a new tab, or hand it to the browser as a download.
 */
export function attachmentUrl(requestId, attachmentId) {
  return attachmentId != null
    ? `/service-requests/${requestId}/attachments/${attachmentId}`
    : `/service-requests/${requestId}/attachment`
}

/** Blob URL for an inline preview (image thumbnails). Caller revokes it. */
export async function fetchAttachmentBlobUrl(requestId, attachmentId) {
  const res = await api.get(attachmentUrl(requestId, attachmentId), { responseType: 'blob' })
  const type = res.headers?.['content-type'] || res.data?.type || 'application/octet-stream'
  return URL.createObjectURL(new Blob([res.data], { type }))
}

export async function openAttachment(requestId, { download = false, attachmentId = null } = {}) {
  const res = await api.get(attachmentUrl(requestId, attachmentId), {
    params: download ? { download: 1 } : undefined,
    responseType: 'blob',
  })
  const type = res.headers?.['content-type'] || res.data?.type || 'application/octet-stream'
  const blob = new Blob([res.data], { type })
  const url = URL.createObjectURL(blob)
  const name = (res.headers?.['content-disposition'] || '').match(/filename="?([^";]+)"?/)?.[1] || 'attachment'

  if (download) {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } else {
    const win = window.open(url, '_blank', 'noopener')
    if (!win) {
      // Pop-up blocked: fall back to a download so the user still gets the file.
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
