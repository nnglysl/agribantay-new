import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import loginImg from '../assets/poultry.jpg'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import sanjoseBg from '../assets/sanjosebg.png'

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

function BackIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
}

export default function AuthLayout({ children, onBack, backLabel = 'Home' }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const CLIP = 'ellipse(100% 132% at 0% 50%)'

  return (
    <div style={{ ...styles.page, padding: isMobile ? '16px' : '30px' }}>
      <style>{`
        html, body { margin: 0; }

        @keyframes agb-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .agb-card { animation: agb-fade-in 0.35s ease-out; }

        .agb-input {
          transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
        }
        .agb-input:hover:not(:focus):not(:disabled) { border-color: #b7bdae; }
        .agb-input:focus {
          border-color: #2c8047;
          box-shadow: 0 0 0 3px rgba(44,128,71,0.14);
          background: #ffffff;
        }
        .agb-input:disabled { background: #f1f1ec; color: #9aa79d; cursor: not-allowed; }
        .agb-input::placeholder { color: #a9b0a6; }

        .agb-btn { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease; }
        .agb-btn:active:not(:disabled) { transform: translateY(1px); }
        .agb-primary:hover:not(:disabled) { background-color: #17472a; box-shadow: 0 10px 24px -10px rgba(20,48,28,0.7); }
        .agb-primary:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
        .agb-primary:focus-visible { outline: 2px solid #2c8047; outline-offset: 2px; }

        .agb-icon-btn { transition: color .15s ease, background-color .15s ease; }
        .agb-icon-btn:hover { color: #2c8047; background-color: #f0f4ef; }

        .agb-link:hover { text-decoration: underline; }
      `}</style>

      <button
        type="button"
        onClick={onBack || (() => navigate('/'))}
        style={styles.backHome}
        aria-label={backLabel}
      >
        <BackIcon /> {backLabel}
      </button>

      <div className="agb-card" style={{ ...styles.card, flexDirection: isMobile ? 'column' : 'row', maxWidth: isMobile ? '440px' : '920px', minHeight: isMobile ? 'auto' : '600px' }}>
        {!isMobile && (
          <div style={{ ...styles.imgCell, flex: '0 0 45%', order: 1 }}>
            <div style={{ ...styles.imgCurve, clipPath: CLIP }} />
            <div style={{ ...styles.imgClip, clipPath: CLIP }}>
              <img src={loginImg} alt="AgriBantay" style={styles.artImg} />
            </div>
          </div>
        )}

        <div style={{ ...styles.formCell, order: 2, padding: isMobile ? '36px 26px 32px' : '52px 60px' }}>
          <div style={styles.formInner}>
            <div style={styles.logoRow}>
              <img src={agribantayLogo} alt="" style={styles.logoMark} />
              <img src={agribantayName} alt="AgriBantay" style={styles.logoName} />
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export const authFormStyles = {
  title: { textAlign: 'center', fontSize: '25px', fontWeight: 800, letterSpacing: '-0.01em', color: '#16311d', margin: '0 0 6px' },
  subtitle: { textAlign: 'center', fontSize: '14px', color: '#6b7770', margin: '0 0 32px', lineHeight: 1.55 },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  errorBox: {
    display: 'flex', alignItems: 'flex-start', gap: '9px',
    background: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b3261e',
    padding: '11px 14px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.45,
  },
  label: { display: 'block', fontSize: '13px', fontWeight: 700, color: '#2b3830', marginBottom: '8px' },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: '#9aa79d', pointerEvents: 'none' },
  input: {
    width: '100%', padding: '13px 15px', borderRadius: '11px', border: '1.5px solid #d9dcd4', background: '#fbfbf8',
    fontSize: '14.5px', fontFamily: SANS, color: '#1c2a20', outline: 'none', boxSizing: 'border-box',
  },
  primaryBtn: {
    marginTop: '6px', background: '#2c8047', color: '#fff', border: 'none', borderRadius: '11px', padding: '14px',
    fontSize: '15px', fontWeight: 700, fontFamily: SANS, width: '100%', cursor: 'pointer',
  },
  linkBtn: {
    display: 'block', textAlign: 'center', fontSize: '13.5px', fontWeight: 600, color: '#2c8047',
    background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, marginTop: '20px', width: '100%',
  },
  methodBtn: {
    display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '16px',
    borderRadius: '12px', border: '1.5px solid #d9dcd4', background: '#fbfbf8', cursor: 'pointer',
    fontFamily: SANS, fontSize: '14.5px', fontWeight: 600, color: '#1c2a20', textAlign: 'left', marginBottom: '12px',
    transition: 'border-color .15s ease, background-color .15s ease',
  },
  methodBtnSub: { fontSize: '12px', color: '#8a968d', fontWeight: 400, marginTop: '2px' },
  methodIcon: {
    width: '40px', height: '40px', borderRadius: '10px', background: '#eaf3ec', color: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
}

const styles = {
  page: {
    fontFamily: SANS, color: '#1c2a20', position: 'relative', minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    backgroundImage: `linear-gradient(rgba(20, 48, 28, 0.80),rgba(20, 48, 28, 0.80)), url(${sanjoseBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  },
  backHome: {
    position: 'fixed', top: '22px', left: '22px', zIndex: 40, display: 'inline-flex', alignItems: 'center', gap: '8px',
    height: '40px', padding: '0 16px 0 13px', borderRadius: '999px', border: '1px solid #e3e6dd',
    background: '#fff', color: '#14301c', fontSize: '13.5px', fontWeight: 600, fontFamily: SANS,
    cursor: 'pointer', boxShadow: '0 4px 14px -6px rgba(0,0,0,0.35)',
    transition: 'box-shadow .15s ease, transform .12s ease',
  },
  card: {
    position: 'relative', overflow: 'hidden', display: 'flex', width: '100%', borderRadius: '24px',
    background: '#fff', boxShadow: '0 44px 100px -44px rgba(15,38,22,0.6)',
  },
  imgCell: { position: 'relative', zIndex: 2, alignSelf: 'stretch' },
  imgCurve: { position: 'absolute', top: 0, bottom: 0, left: 0, right: '-22px', background: 'linear-gradient(160deg, #35935a, #1f5a34)' },
  imgClip: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#14301c' },
  artImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  formCell: { position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  formInner: { width: '100%', maxWidth: '360px' },
  logoRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '26px' },
  logoMark: { height: '54px', width: 'auto', objectFit: 'contain' },
  logoName: { height: '30px', width: 'auto', objectFit: 'contain' },
}