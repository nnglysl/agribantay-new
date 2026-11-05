import { useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import { useTableFetch } from '../hooks/useTableFetch'
import { invalidateCache } from '../hooks/useCachedFetch'
import { useIsMobile } from '../hooks/useIsMobile'
import { formatFileSize, fileTypeLabel, openPrivateFile } from '../utils/attachment'
import TableScroll from './TableScroll'
import TableFooter from './TableFooter'
import { BtnBusy, SectionLoader } from './Loading'
import FarmIcon from './farm-details/FarmIcon'
import './control-documents.css'

const CATEGORIES = [{ key: 'odor_control', label: 'Odor Control' }, { key: 'fly_control', label: 'Fly Control' }]

export default function ControlDocuments({ farm, canUpload = false, title = 'Farm Documents' }) {
  return farm?.id ? <DocumentPanel key={`${farm.id}:${canUpload}`} farm={farm} canUpload={canUpload} title={title} /> : <p>Select a farm to view its documents.</p>
}

function DocumentPanel({ farm, canUpload, title }) {
  const url = `/farms/${farm.id}/control-documents`
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const { data: response, loading, isRefetching, error, refetch } = useTableFetch(url, {}, page, pageSize, setPage)
  const data = String(response?.farm_id) === String(farm.id) ? response : null
  const latestDocuments = CATEGORIES.map(type => data?.latest?.[type.key]).filter(Boolean)
  const [history, setHistory] = useState(false)
  const [category, setCategory] = useState(null)
  const [success, setSuccess] = useState('')
  const [fileError, setFileError] = useState('')
  const [opening, setOpening] = useState(null)
  const active = useRef(false)
  const download = useRef(null)
  const mobile = useIsMobile()
  useEffect(() => { active.current = true; return () => { active.current = false; download.current?.abort() } }, [])

  async function open(document, asDownload) {
    if (opening != null) return
    setOpening(document.id); setFileError('')
    const controller = new AbortController()
    download.current = controller
    try {
      await openPrivateFile(`${url}/${document.id}/file`, { download: asDownload, signal: controller.signal })
    } catch (failure) {
      if (active.current && failure.code !== 'ERR_CANCELED') setFileError('The document could not be opened. Please try again or contact LGU Staff.')
    } finally {
      if (active.current) setOpening(null)
    }
  }
  const actions = document => <div className="cd-file-actions"><button type="button" className="cd-button" disabled={opening != null} onClick={() => open(document, false)} aria-label={`View ${document.original_name}`}><FarmIcon name="eye" size={17} />View</button><button type="button" className="cd-button cd-download" disabled={opening != null} onClick={() => open(document, true)} aria-label={`Download ${document.original_name}`} title={opening === document.id ? 'Opening document…' : `Download ${document.original_name}`}><FarmIcon name={opening === document.id ? 'hourglass' : 'download'} size={17} /></button></div>
  const uploadButton = canUpload && <button type="button" className="cd-button cd-upload" onClick={() => { setSuccess(''); setCategory('odor_control') }}><FarmIcon name="upload" size={18} />Upload Document</button>
  const documentTable = (documents, historical = false) => <TableScroll><table className="cd-table" aria-label={historical ? 'Document submission history' : 'Current farm documents'}><thead><tr><th>File Name</th><th>Document Type</th><th>Date Uploaded</th><th className="agb-table-actions-cell">Actions</th></tr></thead><tbody>{documents.map(document => <tr key={document.id}>
    <td><div className="cd-file-name"><FarmIcon name="document" size={19} /><strong>{document.original_name}</strong></div><small>{fileTypeLabel(document.mime_type, document.original_name)} · {formatFileSize(document.file_size)}{historical && ` · ${document.is_latest ? 'Current submission' : 'Previous Submission'}`}</small>{document.remarks && <span className="cd-remarks">{document.remarks}</span>}</td>
    <td><span className="cd-type">{document.document_type}</span></td><td>{document.uploaded_at}<small>Uploaded by {document.uploaded_by || 'Not recorded'}</small></td>
    <td className="agb-table-actions-cell">{actions(document)}</td>
  </tr>)}</tbody></table></TableScroll>

  return <section className="control-documents" aria-label={title}>
    <div className="cd-heading"><div className="cd-title"><span className="cd-heading-icon"><FarmIcon name="document" size={22} /></span><div><h2>{title}</h2><p className="cd-description">Supporting documents for this farm, such as contracts, permits, and certificates.</p>{canUpload && <p className="cd-caption cd-farm-name">{farm.farm_name}</p>}</div></div>{!error && !loading && data && uploadButton}</div>
    {success && <p className="cd-feedback cd-feedback--success" role="status">{success}</p>}
    {fileError && <p className="cd-feedback cd-feedback--error" role="alert">{fileError}</p>}
    {error ? <div className="cd-feedback cd-feedback--error" role="alert"><span>Unable to load documents. Please try again.</span><button type="button" className="cd-button" disabled={loading || isRefetching} onClick={refetch}>{loading || isRefetching ? 'Retrying…' : 'Retry'}</button></div>
      : loading || !data ? <div role="status" aria-label="Loading control documents"><SectionLoader /></div>
      : <>
        {latestDocuments.length ? documentTable(latestDocuments) : <div className="cd-empty"><p>No documents uploaded yet.</p></div>}
        {data.total > 0 && <button type="button" className="cd-button cd-history-toggle" aria-expanded={history} onClick={() => setHistory(value => !value)}>{history ? 'Hide Submission History' : 'View Submission History'}<span aria-hidden="true">{history ? '−' : '+'}</span></button>}
        {history && <div className="cd-history"><h3>Submission History</h3>
          {documentTable(data.items, true)}
          <TableFooter currentPage={data.current_page} totalPages={data.last_page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} totalItems={data.total} rangeStart={(data.current_page - 1) * pageSize + 1} rangeEnd={Math.min(data.current_page * pageSize, data.total)} isMobile={mobile} />
        </div>}
      </>}
    {canUpload && category && <UploadDocument farm={farm} initialCategory={category} maxKb={data?.max_file_kb || 5120} onClose={() => setCategory(null)} onSaved={() => { if (active.current) { setCategory(null); setSuccess('Document submitted. Previous submissions have been kept.'); setPage(1) } invalidateCache(url) }} />}
  </section>
}

function UploadDocument({ farm, initialCategory, maxKb, onClose, onSaved }) {
  const [category, setCategory] = useState(initialCategory)
  const [file, setFile] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const form = useRef(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    form.current.querySelector('select').focus()
    return () => { mounted.current = false; document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current) return
    if (!file) { setError('Please choose a file.'); return }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) || (file.type && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))) { setError('Choose a PDF, JPG, JPEG or PNG file.'); return }
    if (!file.size || file.size > maxKb * 1024) { setError(`Choose a nonempty file up to ${formatFileSize(maxKb * 1024)}.`); return }
    inFlight.current = true; setBusy(true); setError('')
    const body = new FormData()
    body.append('category', category); body.append('document', file); body.append('remarks', remarks.trim())
    try {
      await api.post(`/farmer/farms/${farm.id}/control-documents`, body)
      onSaved()
    } catch (failure) {
      if (mounted.current) setError(failure.response?.data?.errors?.document?.[0] || failure.response?.data?.message || 'The document could not be submitted. Please try again.')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function keyboard(event) {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const elements = [...form.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div className="cd-overlay" onClick={() => { if (!busy) onClose() }}><div className="cd-modal" role="dialog" aria-modal="true" aria-labelledby="control-upload-title" onClick={event => event.stopPropagation()} onKeyDown={keyboard}>
    <div className="cd-modal-heading"><h2 id="control-upload-title">Submit Control Document</h2><button type="button" className="cd-button" onClick={onClose} disabled={busy} aria-label="Close document form">×</button></div>
    <p className="cd-selected-farm"><span>Selected Farm</span><strong>{farm.farm_name}</strong></p>
    <form ref={form} onSubmit={submit}>
      {error && <p className="cd-feedback cd-feedback--error" role="alert">{error}</p>}
      <label htmlFor="control-document-category">Document Type</label><select id="control-document-category" value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>{CATEGORIES.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}</select>
      <label htmlFor="control-document-file">File</label><input id="control-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0] || null)} disabled={busy} aria-describedby="control-file-hint" />
      <p id="control-file-hint" className="cd-caption">PDF, JPG, JPEG or PNG · Up to {formatFileSize(maxKb * 1024)}. Earlier submissions are kept.</p>
      <label htmlFor="control-document-remarks">Remarks <span>(optional)</span></label><textarea id="control-document-remarks" maxLength={1000} value={remarks} onChange={event => setRemarks(event.target.value)} disabled={busy} rows={3} />
      <div className="cd-modal-actions"><button type="button" className="cd-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="cd-button cd-button--primary" disabled={busy}>{busy ? <BtnBusy label="Submitting…" /> : 'Submit Document'}</button></div>
    </form>
  </div></div>
}
