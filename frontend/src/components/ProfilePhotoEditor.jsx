import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * Circular profile-photo editor: choose a picture, drag it into place, zoom
 * with the slider, reset — then export the visible circle as a square JPEG.
 * Pointer events cover mouse, pen and touch. The image is always kept
 * covering the crop circle, so no empty space can show through it.
 *
 * Controlled by the parent only through `file` (null shows the initials) and
 * `onFileChange`; the crop itself lives here. `ref.exportBlob()` returns the
 * cropped image for the existing upload workflow.
 */
const SIZE = 240        // crop circle diameter on screen
const OUTPUT = 512      // exported square size
const MIN_ZOOM = 1
const MAX_ZOOM = 3

const ProfilePhotoEditor = forwardRef(function ProfilePhotoEditor({ file, initials, onFileChange, disabled }, ref) {
  const inputRef = useRef(null)
  const areaRef = useRef(null)
  const drag = useRef(null)
  const [img, setImg] = useState(null)          // { url, w, h }
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // offset of the image centre from the circle centre, px

  // Load the selected file once into an <img> we can measure and draw.
  useEffect(() => {
    if (!file) { setImg(null); return undefined }
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.onload = () => setImg({ url, w: el.naturalWidth, h: el.naturalHeight, el })
    el.onerror = () => { setImg(null); onFileChange?.(null, 'That file could not be read as an image.') }
    el.src = url
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Base scale makes the shorter side exactly fill the circle ("cover").
  const base = img ? SIZE / Math.min(img.w, img.h) : 1
  const scale = base * zoom
  const drawW = img ? img.w * scale : 0
  const drawH = img ? img.h * scale : 0

  // The image edges may never move inside the circle's bounding square.
  const clamp = useCallback((p, z) => {
    if (!img) return { x: 0, y: 0 }
    const s = base * z
    const maxX = Math.max(0, (img.w * s - SIZE) / 2)
    const maxY = Math.max(0, (img.h * s - SIZE) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) }
  }, [img, base])

  const reset = () => { setZoom(1); setPos({ x: 0, y: 0 }) }
  const changeZoom = (z) => { setZoom(z); setPos(p => clamp(p, z)) }

  const onPointerDown = (e) => {
    if (!img || disabled) return
    e.preventDefault()
    // Capture keeps the drag alive when the pointer leaves the circle; if the
    // browser refuses it, dragging still works while the pointer stays inside.
    try { areaRef.current?.setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origin: pos }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    e.preventDefault()
    setPos(clamp({ x: d.origin.x + (e.clientX - d.startX), y: d.origin.y + (e.clientY - d.startY) }, zoom))
  }
  const endDrag = (e) => { if (drag.current && drag.current.id === e.pointerId) drag.current = null }

  const pick = (e) => {
    const f = e.target.files?.[0] || null
    e.target.value = ''
    if (!f) return
    reset()
    onFileChange?.(f, null)
  }

  useImperativeHandle(ref, () => ({
    hasImage: () => !!img,
    /** The visible circle as a square JPEG blob (background white behind transparent PNGs). */
    exportBlob: () => new Promise((resolve, reject) => {
      if (!img) return reject(new Error('No image selected.'))
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT; canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUTPUT, OUTPUT)
      const k = OUTPUT / SIZE
      const x = (SIZE / 2 - drawW / 2 + pos.x) * k
      const y = (SIZE / 2 - drawH / 2 + pos.y) * k
      ctx.drawImage(img.el, x, y, drawW * k, drawH * k)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', 0.92)
    }),
  }), [img, drawW, drawH, pos])

  return (
    <div style={s.wrap}>
      <div
        ref={areaRef}
        style={{ ...s.area, cursor: img ? (drag.current ? 'grabbing' : 'grab') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        role="img"
        aria-label={img ? 'Profile photo crop area. Drag to reposition.' : 'No photo selected'}
      >
        {img ? (
          <img
            src={img.url}
            alt=""
            draggable={false}
            style={{
              ...s.img,
              width: `${drawW}px`, height: `${drawH}px`,
              transform: `translate(${SIZE / 2 - drawW / 2 + pos.x}px, ${SIZE / 2 - drawH / 2 + pos.y}px)`,
            }}
          />
        ) : (
          <div style={s.placeholder}>{initials}</div>
        )}
        {img && <div style={s.ring} aria-hidden="true" />}
      </div>

      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={s.hidden} tabIndex={-1} aria-hidden="true" />

      <div style={s.controls}>
        <button type="button" onClick={() => changeZoom(Math.max(MIN_ZOOM, +(zoom - 0.1).toFixed(2)))} disabled={!img || disabled} style={{ ...s.zoomBtn, ...(!img || disabled ? s.off : {}) }} aria-label="Zoom out">−</button>
        <input
          type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom}
          onChange={e => changeZoom(Number(e.target.value))}
          disabled={!img || disabled}
          aria-label="Zoom"
          style={s.slider}
        />
        <button type="button" onClick={() => changeZoom(Math.min(MAX_ZOOM, +(zoom + 0.1).toFixed(2)))} disabled={!img || disabled} style={{ ...s.zoomBtn, ...(!img || disabled ? s.off : {}) }} aria-label="Zoom in">+</button>
      </div>

      <div style={s.row}>
        <button type="button" onClick={() => !disabled && inputRef.current?.click()} disabled={disabled} style={{ ...s.secondaryBtn, ...(disabled ? s.off : {}) }}>
          {img ? 'Choose Another' : 'Choose Photo'}
        </button>
        <button type="button" onClick={reset} disabled={!img || disabled || (zoom === 1 && pos.x === 0 && pos.y === 0)} style={{ ...s.secondaryBtn, ...(!img || disabled || (zoom === 1 && pos.x === 0 && pos.y === 0) ? s.off : {}) }}>
          Reset
        </button>
      </div>
      <div style={s.hint}>{img ? 'Drag to reposition · use the slider to zoom' : 'JPG or PNG, up to 5 MB'}</div>
    </div>
  )
})

export default ProfilePhotoEditor

const s = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  area: {
    position: 'relative', width: `${SIZE}px`, height: `${SIZE}px`, maxWidth: '100%', borderRadius: '50%', overflow: 'hidden',
    backgroundColor: '#eef1ea', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
  },
  img: { position: 'absolute', top: 0, left: 0, maxWidth: 'none', pointerEvents: 'none', willChange: 'transform' },
  ring: { position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.9)', pointerEvents: 'none' },
  placeholder: {
    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '56px', fontWeight: 700, color: '#2c8047', backgroundColor: '#e3f0e7',
  },
  hidden: { position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' },
  controls: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: `${SIZE + 40}px` },
  slider: { flex: 1, accentColor: '#2c8047', margin: 0 },
  zoomBtn: {
    width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '16px', lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  },
  row: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' },
  secondaryBtn: {
    padding: '8px 14px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  hint: { fontSize: '12px', color: '#8a968d', textAlign: 'center' },
  off: { opacity: 0.45, cursor: 'not-allowed' },
}
