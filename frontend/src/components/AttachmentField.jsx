import { useRef, useState } from 'react'
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_FILES } from '../constants/serviceTypes'
import { formatFileSize, fileTypeLabel, validateAttachment } from '../utils/attachment'

/**
 * Pick the accomplished form: existing files (several at once), or photos
 * from the device camera one at a time. Up to ATTACHMENT_MAX_FILES in total,
 * counting files already on the request (`existing`, from a completion that
 * was undone) together with the new selection.
 *
 * Two hidden inputs: the camera one carries `capture`, which mobile
 * browsers honour by opening the rear camera (one shot per tap; tap again
 * for the next page) and desktop browsers simply ignore, so "Take Photo"
 * degrades to a normal picker there. Neither asks for camera permission
 * until the Vet taps it.
 *
 * Controlled: the parent owns `files` and the message, so the selection
 * survives a failed submit exactly like the notes do.
 */
export default function AttachmentField({
  files, onChange, existing = [], onRemoveExisting, error, disabled, required, label, hint, progress, max = ATTACHMENT_MAX_FILES,
}) {
  const fileRef = useRef(null)
  const cameraRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('')

  const total = existing.length + files.length
  const room = Math.max(0, max - total)
  const full = room === 0

  // Adds what fits, reports what does not. Invalid files are never added.
  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    if (!incoming.length) return
    const problems = []
    const accepted = []
    for (const f of incoming) {
      const problem = validateAttachment(f)
      if (problem) { problems.push(`${f.name}: ${problem}`); continue }
      if (accepted.length >= room) { problems.push(`${f.name}: not added, maximum of ${max} attachments reached.`); continue }
      accepted.push(f)
    }
    if (accepted.length) onChange([...files, ...accepted])
    setNotice(problems.join(' '))
  }
  const pick = (e) => {
    // Copy first, then reset so choosing the same file again still fires onChange.
    const copy = Array.from(e.target.files || [])
    e.target.value = ''
    addFiles(copy)
  }
  const removeAt = (i) => { setNotice(''); releasePreview(files[i]); onChange(files.filter((_, k) => k !== i)) }
  const drop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || full) return
    addFiles(e.dataTransfer?.files)
  }
  const openPicker = (ref) => { if (!disabled && !full) ref.current?.click() }

  return (
    <div style={s.wrap}>
      <div style={s.labelRow}>
        <label style={s.label}>
          <span style={s.labelIcon} aria-hidden="true"><ClipIcon /></span>
          {label} {required && <span style={s.required}>*</span>}
        </label>
        <span style={{ ...s.count, ...(full ? s.countFull : {}) }} aria-live="polite">{total} of {max} attachments</span>
      </div>
      {hint && <p style={s.hint}>{hint}</p>}

      <input ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={pick} style={s.hidden} tabIndex={-1} aria-hidden="true" />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick} style={s.hidden} tabIndex={-1} aria-hidden="true" />

      <div
        style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}), ...(disabled || full ? s.dropZoneDisabled : {}) }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !full) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <div style={s.dropIcon} aria-hidden="true"><UploadIcon /></div>
        <div style={s.dropTitle}>{full ? `Maximum of ${max} attachments reached` : 'Drag and drop files here, or'}</div>
        <div style={s.pickRow}>
          <button type="button" onClick={() => openPicker(fileRef)} disabled={disabled || full} style={{ ...s.pickBtn, ...s.pickBtnPrimary, ...(disabled || full ? s.btnDisabled : {}) }}><FolderIcon /> Choose Files</button>
          <button type="button" onClick={() => openPicker(cameraRef)} disabled={disabled || full} style={{ ...s.pickBtn, ...(disabled || full ? s.btnDisabled : {}) }}><CameraIcon /> Take Photos</button>
        </div>
        <div style={s.formats}>{full ? 'Remove a file to add another.' : `Up to 5 MB per file • PDF, JPG, JPEG, PNG • ${room} more ${room === 1 ? 'file' : 'files'} allowed`}</div>
      </div>

      {total > 0 && (
        <div style={s.panel}>
          <div style={s.panelHead}>
            <span style={s.panelTitle}>Selected files ({total})</span>
            {!disabled && !full && (
              <button type="button" onClick={() => openPicker(fileRef)} style={s.addMoreBtn}><PlusIcon /> Add more files</button>
            )}
          </div>
          <div style={s.grid}>
            {existing.map((a) => (
              <Card
                key={`existing-${a.id}`}
                name={a.original_name}
                typeLabel={fileTypeLabel(a.mime_type, a.original_name)}
                size={a.file_size}
                status="uploaded"
                onRemove={onRemoveExisting && !disabled ? () => onRemoveExisting(a) : null}
              />
            ))}
            {files.map((f, i) => (
              <Card
                key={keyFor(f)}
                name={f.name}
                typeLabel={fileTypeLabel(f.type, f.name)}
                size={f.size}
                previewUrl={previewFor(f)}
                status={progress != null ? 'uploading' : 'ready'}
                progress={progress}
                onRemove={disabled ? null : () => removeAt(i)}
              />
            ))}
          </div>
        </div>
      )}

      {notice && <div style={s.notice}>{notice}</div>}
      {error && <div style={s.error}>{error}</div>}
    </div>
  )
}

// Stable identity and preview URL per selected File object, so removing one
// card does not remount (and re-create the preview of) every card after it,
// and a dev StrictMode effect re-run never revokes a URL an <img> still uses.
// The preview is revoked when the file is removed; the modal is short-lived,
// so anything left is released with the page.
const fileKeys = new WeakMap()
const filePreviews = new WeakMap()
let nextKey = 0
function keyFor(file) {
  if (!fileKeys.has(file)) fileKeys.set(file, `f${++nextKey}`)
  return fileKeys.get(file)
}
function previewFor(file) {
  if (!/^image\//.test(file.type)) return null
  if (!filePreviews.has(file)) filePreviews.set(file, URL.createObjectURL(file))
  return filePreviews.get(file)
}
function releasePreview(file) {
  const url = filePreviews.get(file)
  if (url) { URL.revokeObjectURL(url); filePreviews.delete(file) }
}

function Card({ name, typeLabel, size, previewUrl, status, progress, onRemove }) {
  return (
    <div style={s.card}>
      {previewUrl ? (
        <img src={previewUrl} alt={`Selected form preview: ${name}`} style={s.preview} />
      ) : (
        <div style={s.docIcon}>{typeLabel}</div>
      )}
      <div style={s.fileMeta}>
        <div style={s.fileName} title={name}>{name}</div>
        <div style={s.fileSub}>{typeLabel}{size != null && ` • ${formatFileSize(size)}`}</div>
        {status === 'uploaded' && <div style={s.statusOk}><CheckIcon /> Uploaded</div>}
        {status === 'ready' && <div style={s.statusReady}>Ready to upload</div>}
        {status === 'uploading' && (
          <div style={s.statusUploading}>
            <span style={s.statusUploadingText}>Uploading…</span>
            <div style={s.progressTrack}><div style={{ ...s.progressBar, width: `${progress}%` }} /></div>
            <span style={s.progressPct}>{progress}%</span>
          </div>
        )}
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} style={s.removeBtn}>×</button>
      )}
    </div>
  )
}

const UploadIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
  </svg>
)
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
)
const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />
  </svg>
)

const ClipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
)
const s = {
  wrap: { marginTop: '16px' },
  labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' },
  label: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  labelIcon: { color: '#2c8047', display: 'inline-flex' },
  required: { color: '#b91c1c', fontWeight: 700 },
  count: { fontSize: '12px', fontWeight: 700, color: '#256b3d', backgroundColor: '#eaf3ec', padding: '2px 9px', borderRadius: '999px' },
  countFull: { color: '#b45309', backgroundColor: '#fbf1e2' },
  hint: { fontSize: '12px', color: '#6b7770', marginTop: 0, marginBottom: '10px', lineHeight: 1.45 },
  hidden: { position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' },
  dropZone: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', padding: '22px 16px', borderRadius: '12px', borderWidth: '1.5px', borderStyle: 'dashed', borderColor: '#c9d3cc', backgroundColor: '#fff', transition: 'border-color 0.15s, background-color 0.15s' },
  dropZoneActive: { borderColor: '#2c8047', backgroundColor: '#eaf3ec' },
  dropZoneDisabled: { backgroundColor: '#fafbf8' },
  dropIcon: { color: '#33413a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontSize: '13px', fontWeight: 600, color: '#33413a' },
  pickRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' },
  pickBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '9px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#cfd6d0', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  pickBtnPrimary: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  btnDisabled: { opacity: 0.55, cursor: 'not-allowed' },
  formats: { fontSize: '11.5px', color: '#8a968d' },
  panel: { marginTop: '12px', border: '1px solid #e7e8e0', borderRadius: '12px', padding: '12px', backgroundColor: '#fff' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' },
  panelTitle: { fontSize: '12.5px', fontWeight: 700, color: '#33413a' },
  addMoreBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #cfd6d0', backgroundColor: '#fff', color: '#16311d', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: '10px' },
  card: { position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #e7e8e0', borderRadius: '10px', padding: '10px 34px 10px 10px', backgroundColor: '#fafbf8' },
  preview: { width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e7e8e0', flexShrink: 0, backgroundColor: '#fff' },
  docIcon: { width: '52px', height: '52px', borderRadius: '8px', border: '1px solid #e7e8e0', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#4338ca', flexShrink: 0 },
  fileMeta: { flex: 1, minWidth: 0 },
  fileName: { fontSize: '13px', fontWeight: 700, color: '#16311d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileSub: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  statusOk: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '5px', fontSize: '11.5px', fontWeight: 700, color: '#256b3d', backgroundColor: '#eaf3ec', padding: '2px 8px', borderRadius: '999px' },
  statusReady: { display: 'inline-flex', marginTop: '5px', fontSize: '11.5px', fontWeight: 700, color: '#6b7770', backgroundColor: '#eef1ea', padding: '2px 8px', borderRadius: '999px' },
  statusUploading: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' },
  statusUploadingText: { fontSize: '11.5px', fontWeight: 600, color: '#2f5fa0', whiteSpace: 'nowrap' },
  progressTrack: { flex: 1, height: '5px', borderRadius: '999px', backgroundColor: '#e7e8e0', overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#2f5fa0', transition: 'width 0.2s' },
  progressPct: { fontSize: '11px', color: '#6b7770', whiteSpace: 'nowrap' },
  removeBtn: { position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', backgroundColor: 'transparent', color: '#8a968d', fontSize: '18px', lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
  notice: { marginTop: '8px', fontSize: '12.5px', color: '#b45309', fontWeight: 600 },
  error: { marginTop: '8px', fontSize: '12.5px', color: '#b91c1c', fontWeight: 600 },
}
