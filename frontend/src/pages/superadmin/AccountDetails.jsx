import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

function getInitials(first, last) {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase()
}

export default function AccountDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const { data: account, loading, error, refetch } = useCachedFetch(`/superadmin/accounts/${id}`)

  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState(null)

  if (loading) return <AdminLayout><p style={styles.stateText}>Loading account…</p></AdminLayout>
  if (error || !account) {
    return <AdminLayout><p style={{ ...styles.stateText, color: '#dc2626' }}>{error || 'Account not found.'}</p></AdminLayout>
  }

  const isActive = account.status === 'active'
  const roleLabel = account.role === 'admin' ? 'Administrator' : 'Veterinarian'
  const initials = getInitials(account.first_name, account.last_name)

  const startEdit = () => {
    setFirstName(account.first_name)
    setLastName(account.last_name)
    setEmail(account.email || '')
    setMobileNumber(account.mobile_number || '')
    setProfileError('')
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setProfileError('')
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileLoading(true)
    try {
      await api.put(`/superadmin/accounts/${id}`, {
        full_name: `${firstName} ${lastName}`.trim(),
        email,
        contact_number: mobileNumber,
      })
      await refetch()
      setProfileSuccess('Account updated successfully.')
      setIsEditing(false)
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update account.')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setResetting(true)
    try {
      const res = await api.post(`/superadmin/accounts/${id}/reset-password`)
      setConfirmReset(false)
      setResetResult(res.data.temp_password)
      refetch()
    } finally {
      setResetting(false)
    }
  }

  return (
    <AdminLayout>
      <button type="button" style={styles.backBtn} onClick={() => navigate('/superadmin/accounts')}>
        ← Back
      </button>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        {profileSuccess && <div style={styles.successBox}>{profileSuccess}</div>}

        <div style={{ ...styles.photoRow, ...(isMobile ? styles.photoRowMobile : {}) }}>
          <span style={styles.avatarCircle}>
            {account.profile_photo_url ? (
              <img src={account.profile_photo_url} alt="" style={styles.avatarImg} />
            ) : (
              initials || '—'
            )}
          </span>

          <div style={styles.photoInfo}>
            <div style={styles.photoName}>{account.first_name} {account.last_name}</div>
            <div style={styles.photoRole}>{roleLabel}</div>
            <div style={styles.photoMeta}>{account.email || '—'}</div>
            <div style={styles.photoMeta}>{account.mobile_number || '—'}</div>
          </div>

          <span style={{
            ...styles.statusPill,
            color: isActive ? '#166534' : '#6b7280',
            backgroundColor: isActive ? '#f0fdf4' : '#f3f4f6',
          }}>
            <span style={{ ...styles.pillDot, backgroundColor: isActive ? '#2E7D32' : '#6b7280' }} />
            {isActive ? 'Active' : 'Deactivated'}
          </span>
        </div>
      </div>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Personal Information</h3>
          {!isEditing && (
            <button type="button" onClick={startEdit} style={styles.editBtn}>
              <EditIcon /> Edit
            </button>
          )}
        </div>

        <form onSubmit={handleProfileSave}>
          {profileError && <div style={styles.errorBox}>{profileError}</div>}

          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>First Name</label>
              <input
                value={isEditing ? firstName : account.first_name}
                onChange={e => setFirstName(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Last Name</label>
              <input
                value={isEditing ? lastName : account.last_name}
                onChange={e => setLastName(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
          </div>

          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                value={isEditing ? email : (account.email || '')}
                onChange={e => setEmail(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Mobile Number</label>
              <input
                value={isEditing ? mobileNumber : (account.mobile_number || '')}
                onChange={e => setMobileNumber(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
          </div>

          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Role</label>
              <input value={roleLabel} disabled style={{ ...styles.input, ...styles.inputDisabled }} />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Date Created</label>
              <input
                value={account.created_at ? new Date(account.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                disabled
                style={{ ...styles.input, ...styles.inputDisabled }}
              />
            </div>
          </div>

          {isEditing && (
            <div style={{ display: 'flex', gap: '10px', ...(isMobile ? { flexDirection: 'column' } : {}) }}>
              <button
                type="submit"
                disabled={profileLoading}
                style={{ ...styles.saveBtn, ...(isMobile ? styles.btnFull : {}) }}
              >
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                style={{ ...styles.cancelBtn, ...(isMobile ? styles.btnFull : {}) }}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <h3 style={styles.sectionTitle}>Account Security</h3>
        <p style={styles.securityNote}>
          Reset the account password if needed. This will generate a new temporary password for the user.
        </p>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          style={{ ...styles.saveBtn, ...(isMobile ? styles.btnFull : {}) }}
        >
          Reset Password
        </button>
      </div>

      {confirmReset && (
        <div style={modalStyles.overlay} onClick={() => setConfirmReset(false)}>
          <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Reset Password</h3>
            <p style={styles.securityNote}>
              Generate a new temporary password for {account.first_name} {account.last_name}? Their current password
              will stop working immediately.
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmReset(false)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={handleResetPassword} disabled={resetting} style={styles.saveBtn}>
                {resetting ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetResult && (
        <div style={modalStyles.overlay} onClick={() => setResetResult(null)}>
          <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Temporary Password</h3>
            <p style={styles.securityNote}>
              For <strong>{account.first_name} {account.last_name}</strong> — shown once, relay this to them directly:
            </p>
            <div style={styles.tempPasswordBox}>{resetResult}</div>
            <div style={modalStyles.actions}>
              <button onClick={() => setResetResult(null)} style={styles.saveBtn}>Done</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

const styles = {
  stateText: { fontSize: '14px', color: '#6b7280' },

  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
    borderRadius: '999px', border: '1px solid #d1d5db', backgroundColor: '#fff',
    color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px',
  },

  card: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  cardMobile: { padding: '16px' },

  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '13px', fontWeight: '700', color: '#374151', margin: 0, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.03em' },
  editBtn: {
    backgroundColor: 'white', color: '#2E7D32', border: '1px solid #2E7D32',
    borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
  },

  photoRow: { display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' },
  photoRowMobile: { gap: '14px' },
  photoInfo: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  avatarCircle: {
    width: '68px', height: '68px', borderRadius: '50%', backgroundColor: '#2E7D32', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700',
    flexShrink: 0, overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoName: { fontSize: '17px', fontWeight: '700', color: '#111827' },
  photoRole: { fontSize: '13.5px', color: '#6b7280', marginTop: '3px' },
  photoMeta: { fontSize: '13px', color: '#374151', marginTop: '4px' },

  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, flexShrink: 0 },
  pillDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },

  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  rowMobile: { gridTemplateColumns: '1fr', gap: '0px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', width: '100%',
  },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },

  saveBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px',
  },
  cancelBtn: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px',
  },
  btnFull: { width: '100%', boxSizing: 'border-box' },

  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
  successBox: {
    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },

  securityNote: { fontSize: '13px', color: '#6b7280', lineHeight: 1.5, marginTop: 0, marginBottom: '16px' },

  tempPasswordBox: {
    fontFamily: 'monospace', fontSize: '18px', fontWeight: '700', color: '#111827',
    backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
    padding: '14px', textAlign: 'center', letterSpacing: '1px', marginBottom: '4px',
  },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px',
  },
  modal: {
    backgroundColor: 'white', borderRadius: '14px', padding: '24px',
    width: '420px', maxWidth: '100%', boxSizing: 'border-box',
  },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' },
}
