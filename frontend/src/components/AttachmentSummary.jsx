import { useEffect, useState } from 'react'
import { formatDateTime } from '../utils/formatDate'
import { formatFileSize, fileTypeLabel, openAttachment, fetchAttachmentBlobUrl } from '../utils/attachment'
import { viewModalStyles as v } from '../styles/viewModalStyles'

/**
 * Read-only list of a request's attached forms (name, type, size, upload
 * date, uploader) with View / Download per file and a thumbnail for images.
 * Every byte comes through the authorized endpoint, so whoever can see
 * this request can open its files and nobody else can. Renders nothing
 * when the request has no attachments, so older completions look exactly
 * as before. Accepts the list, or the legacy single `attachment`.
 */
export default function AttachmentSummary({ requestId, attachments, attachment, title = 'Attached Forms' }) {
  const list = Array.isArray(attachments) ? attachments : (attachment ? [attachment] : [])
  if (!list.length) return null

  return (
    <>
      <span style={v.sectionLabel}>{title} ({list.length})</span>
      <div style={s.list}>
        {list.map((a, i) => <Row key={a.id ?? i} requestId={requestId} attachment={a} index={i} />)}
      </div>
    </>
  )
}

function Row({ requestId, attachment, index }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const isImage = /^image\//.test(attachment.mime_type || '')
  const thumb = useThumbnail(isImage ? requestId : null, attachment.id)

  const act = async (download) => {
    setError('')
    setBusy(download ? 'download' : 'view')
    try {
      await openAttachment(requestId, { download, attachmentId: attachment.id })
    } catch (err) {
      setError(err.response?.status === 403
        ? 'You are not allowed to open this file.'
        : err.response?.status === 404 ? 'The file could not be found.' : 'The file could not be opened right now.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={s.box}>
      {thumb ? (
        <img src={thumb} alt={`Attachment ${index + 1} preview`} style={s.thumb} />
      ) : (
        <div style={s.icon}>{fileTypeLabel(attachment.mime_type, attachment.original_name)}</div>
      )}
      <div style={s.meta}>
        <div style={s.name} title={attachment.original_name}>{index + 1}. {attachment.original_name}</div>
        <div style={s.sub}>
          {fileTypeLabel(attachment.mime_type, attachment.original_name)}
          {attachment.file_size != null && ` · ${formatFileSize(attachment.file_size)}`}
        </div>
        <div style={s.sub}>
          {attachment.uploaded_at && `Uploaded ${formatDateTime(attachment.uploaded_at)}`}
          {attachment.uploaded_by && ` by ${attachment.uploaded_by}`}
        </div>
        {error && <div style={s.error}>{error}</div>}
      </div>
      <div style={s.actions}>
        <button type="button" onClick={() => act(false)} disabled={!!busy} style={s.btn}>{busy === 'view' ? 'Opening…' : 'View'}</button>
        <button type="button" onClick={() => act(true)} disabled={!!busy} style={s.btn}>{busy === 'download' ? 'Preparing…' : 'Download'}</button>
      </div>
    </div>
  )
}

/** Fetches an image attachment as a blob URL for the thumbnail; silent on failure. */
function useThumbnail(requestId, attachmentId) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (requestId == null || attachmentId == null) return undefined
    let alive = true
    let created = null
    fetchAttachmentBlobUrl(requestId, attachmentId)
      .then((u) => { if (alive) { created = u; setUrl(u) } else URL.revokeObjectURL(u) })
      .catch(() => {})
    return () => { alive = false; if (created) URL.revokeObjectURL(created) }
  }, [requestId, attachmentId])
  return url
}

const s = {
  list: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' },
  box: { display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #e7e8e0', borderRadius: '8px', backgroundColor: '#fafbf8', padding: '10px 12px', flexWrap: 'wrap' },
  icon: { width: '46px', height: '46px', borderRadius: '8px', border: '1px solid #e7e8e0', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#4338ca', flexShrink: 0 },
  thumb: { width: '46px', height: '46px', borderRadius: '8px', border: '1px solid #e7e8e0', objectFit: 'cover', flexShrink: 0, backgroundColor: '#fff' },
  meta: { flex: 1, minWidth: '140px' },
  name: { fontSize: '13.5px', fontWeight: 600, color: '#16311d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sub: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  actions: { display: 'flex', gap: '8px' },
  btn: { padding: '7px 14px', borderRadius: '8px', border: '1px solid #cfe3d5', backgroundColor: '#f2f8f4', color: '#256b3d', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  error: { fontSize: '12px', color: '#b91c1c', fontWeight: 600, marginTop: '4px' },
}
