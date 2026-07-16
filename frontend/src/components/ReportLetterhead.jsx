import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'

/**
 * Standard letterhead block used at the top of every printed/exported
 * report. Shared across report modules so branding and layout stay
 * identical everywhere — swap the logo once here rather than in every
 * report file individually.
 */
export default function ReportLetterhead({ officeLine = 'Municipal Agriculture Office' }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <img src={agribantayLogo} alt="AgriBantay logo" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
        <img src={agribantayName} alt="AgriBantay" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px' }}>Republic of the Philippines</div>
        <div style={{ fontSize: '11px' }}>Province of Batangas</div>
        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Municipality of San Jose</div>
        <div style={{ fontSize: '12px' }}>{officeLine}</div>
      </div>
    </div>
  )
}