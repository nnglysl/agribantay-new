import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import api from '../../api/axios'
import { availablePrintSections, loadFarmPrintData, paperDimensions, printCss, printRange } from '../../utils/farmPrint'
import { getUser } from '../../utils/auth'
import FarmPrintDocument from './FarmPrintDocument'
import './farm-print.css'

function Preview({ report, frameRef, onReady, onError }) {
  const [doc, setDoc] = useState(null), [size, setSize] = useState({ width: 0, height: 850 })
  const viewport = useRef(null)
  // Screen preview width only; the native Print dialog controls printed pages.
  const pixels = paperDimensions('A4', 'portrait')[0] * 96 / 25.4
  const scale = size.width ? Math.min(1, size.width / pixels) : 1
  useEffect(() => {
    if (!doc) return
    onReady(false)
    const style = doc.createElement('style'); style.textContent = printCss(); doc.head.appendChild(style)
    const title = doc.createElement('title'); title.textContent = `AgriBantay - Farm Records - ${report.farm.farm_name}`; doc.head.appendChild(title)
    let active = true
    const update = () => { const height = Math.max(400, Math.ceil(doc.body.getBoundingClientRect().height)), width = viewport.current?.clientWidth || 0; if (active) setSize(value => value.height === height && value.width === width ? value : { width, height }) }
    let pending = 0
    const resize = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(update) }
    window.addEventListener('resize', resize)
    const timer = setTimeout(async () => {
      try {
        await Promise.all([...doc.images].map(image => image.decode()))
        await doc.fonts.ready
        update(); if (active) onReady(true)
      } catch { if (active) onError('The report branding could not be loaded. Generate the preview again before printing.') }
    }, 80)
    return () => { active = false; clearTimeout(timer); window.removeEventListener('resize', resize); cancelAnimationFrame(pending); style.remove(); title.remove(); onReady(false) }
  }, [doc, report, onReady, onError])
  return <div className="fp-preview-viewport" ref={viewport}><div style={{ height: size.height * scale, width: pixels * scale, position: 'relative', margin: '0 auto' }}>
    <iframe ref={frameRef} className="fp-preview-frame" title="Farm records print preview" scrolling="no" sandbox="allow-same-origin allow-modals" srcDoc="<!doctype html><html lang='en'><head><meta charset='utf-8'></head><body></body></html>" onLoad={event => setDoc(event.currentTarget.contentDocument)} style={{ width: pixels, height: size.height, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
    {doc && createPortal(<FarmPrintDocument report={report} />, doc.body)}
  </div></div>
}

export default function FarmPrintDialog({ farmId, onClose }) {
  const [options, setOptions] = useState(null)
  const [dateMode, setDateMode] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState(null)
  const [report, setReport] = useState(null), [ready, setReady] = useState(false), [printMessage, setPrintMessage] = useState('')
  const request = useRef(null), revision = useRef(0), frame = useRef(null), dialog = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    api.get(`/admin/farms/${farmId}/print-options`, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return
      if (String(response.data.data.farm?.id) !== String(farmId)) throw Error('The selected farm could not be verified.')
      setOptions(response.data.data)
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.response?.data?.message || failure.message || 'Print options could not be loaded.') })
    return () => { controller.abort(); request.current?.abort() }
  }, [farmId])
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.querySelector('button')?.focus()
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),iframe')]
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('keydown', keyboard); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [onClose])
  const sections = options ? availablePrintSections(options) : []
  const unavailable = options?.sections.filter(section => !sections.includes(section.key)) || []
  const changeRange = update => { request.current?.abort(); revision.current++; setBusy(false); setReport(null); setReady(false); setError(''); setProgress(null); setPrintMessage(''); update() }
  async function preview() {
    const range = printRange(dateMode, from, to)
    if (range.error || !sections.length) { setError(range.error || 'No farm record sections are currently available.'); return }
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    const version = ++revision.current
    setBusy(true); setError(''); setReport(null); setReady(false); setPrintMessage('')
    try {
      const data = await loadFarmPrintData(farmId, { sections, dateMode, from, to }, { signal: controller.signal, onProgress: value => { if (version === revision.current) setProgress(value) } })
      if (version === revision.current && !controller.signal.aborted) setReport({ ...data, generated_role: getUser().role })
    } catch (failure) {
      if (version === revision.current && !controller.signal.aborted) {
        const message = failure.response?.data?.errors?.sections?.[0] || failure.response?.data?.message || failure.message || 'Print data could not be loaded. Nothing has been printed.'
        setError(message.replace('This selection contains', 'The complete report contains').replace('Narrow the date range or select fewer sections', 'Choose a narrower date range'))
      }
    } finally { if (version === revision.current) setBusy(false) }
  }
  const print = () => {
    if (!ready || !frame.current?.contentWindow) return
    try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); setPrintMessage('The browser controls printing and Save as PDF. If you cancel its dialog, your preview remains available; no records are changed.') }
    catch { setError('The browser could not open printing. Allow printing for this page and try again.') }
  }
  return createPortal(<div className="fp-overlay"><div className="fp-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-title" ref={dialog}>
    <header className="fp-dialog-header"><div><h2 id="fp-title">Print Farm Records</h2>{options && <p>{options.farm.farm_name} · Farm ID: {options.farm.id}</p>}</div><button type="button" aria-label="Close print preview" onClick={onClose}>×</button></header>
    {!options && !error && <p role="status">Loading farm report…</p>}{error && <p className="fp-error" role="alert">{error}</p>}
    {options && <>
      <p className="fp-help">All available farm records will be included automatically.</p>
      <div className="fp-config"><fieldset><legend>Date Range</legend><select aria-label="Print date range" value={dateMode} onChange={event => changeRange(() => setDateMode(event.target.value))}><option value="all">All Dates</option><option value="custom">Custom Date Range</option></select>
        {dateMode === 'custom' && <div className="fp-dates"><label>From Date<input aria-label="Print From Date" type="date" value={from} onChange={event => changeRange(() => setFrom(event.target.value))} /></label><label>To Date<input aria-label="Print To Date" type="date" value={to} onChange={event => changeRange(() => setTo(event.target.value))} /></label></div>}
      </fieldset></div>
      {report && unavailable.length > 0 && <p className="fp-warning" role="status">Not included: {unavailable.map(section => section.label).join(', ')}. These records are currently unavailable.</p>}
      <div className="fp-dialog-actions"><button type="button" disabled={busy || !sections.length} onClick={preview}>{busy ? 'Loading Records…' : 'Preview'}</button><button type="button" className="fp-primary" disabled={!report || !ready || busy} onClick={print}>Print</button><button type="button" onClick={onClose}>Cancel</button></div>
      {busy && <p role="status">Preparing complete farm records{progress ? `: ${progress.received.toLocaleString()} of ${progress.total.toLocaleString()} rows loaded` : '…'}. Cancel to stop retrieval.</p>}{printMessage && <p role="status">{printMessage}</p>}
      {report && <><h3 className="fp-preview-title">Preview</h3><Preview report={report} frameRef={frame} onReady={setReady} onError={setError} /></>}
    </>}{!options && error && <button type="button" onClick={onClose}>Cancel</button>}
  </div></div>, document.body)
}
