import { useEffect, useState } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'
import { getUser, setAuth, getToken } from '../../utils/auth'

export default function Settings() {
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    api.get('/settings').then(res => {
      const data = res.data.data
      setProfile(data)
      setFirstName(data.first_name)
      setLastName(data.last_name)
      setMobileNumber(data.mobile_number)
    })
  }, [])

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileLoading(true)

    try {
      await api.put('/settings/profile', {
        first_name: firstName,
        last_name: lastName,
        mobile_number: mobileNumber,
      })

      const user = getUser()
      setAuth(getToken(), { ...user, first_name: firstName, last_name: lastName })

      setProfile({ ...profile, first_name: firstName, last_name: lastName, mobile_number: mobileNumber })
      setProfileSuccess('Profile updated successfully.')
      setIsEditing(false)
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile.')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setMobileNumber(profile.mobile_number)
    setIsEditing(false)
    setProfileError('')
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setPasswordLoading(true)
    try {
      await api.put('/settings/password', {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      })

      setPasswordSuccess('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Failed to update password.')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!profile) return <VetLayout><p>Loading...</p></VetLayout>

  const initials = `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase()

  return (
    <VetLayout>
      <h1 style={styles.title}>Settings</h1>

      <div style={styles.profileCard}>
        <div style={styles.avatar}>{initials}</div>
        <div>
          <div style={styles.profileName}>{profile.first_name} {profile.last_name}</div>
          <div style={styles.profileSub}>Municipal Veterinarian</div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Personal Information</h3>
          {!isEditing && (
            <button type="button" onClick={() => setIsEditing(true)} style={styles.editBtn}>
              Edit
            </button>
          )}
        </div>

        <form onSubmit={handleProfileSave}>
          {profileError && <div style={styles.errorBox}>{profileError}</div>}
          {profileSuccess && <div style={styles.successBox}>{profileSuccess}</div>}

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>First Name</label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Last Name</label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                disabled={!isEditing}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Mobile Number</label>
            <input
              value={mobileNumber}
              onChange={e => setMobileNumber(e.target.value)}
              disabled={!isEditing}
              style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
            />
          </div>

          {isEditing && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={profileLoading} style={styles.saveBtn}>
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={handleCancelEdit} style={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Change Password</h3>
        <form onSubmit={handlePasswordSave}>
          {passwordError && <div style={styles.errorBox}>{passwordError}</div>}
          {passwordSuccess && <div style={styles.successBox}>{passwordSuccess}</div>}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <button type="submit" disabled={passwordLoading} style={styles.saveBtn}>
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </VetLayout>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '24px' },
  profileCard: {
    display: 'flex', alignItems: 'center', gap: '16px',
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  avatar: {
    width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#2E7D32',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', fontWeight: '700',
  },
  profileName: { fontSize: '16px', fontWeight: '700', color: '#111827' },
  profileSub: { fontSize: '13px', color: '#6b7280' },
  card: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitle: { fontSize: '15px', fontWeight: '700', color: '#111827', margin: 0 },
  editBtn: {
    backgroundColor: 'white', color: '#2E7D32', border: '1px solid #2E7D32',
    borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box',
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
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
  successBox: {
    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
}