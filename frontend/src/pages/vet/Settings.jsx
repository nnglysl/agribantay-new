import { useEffect, useState, useRef } from 'react'
import api from '../../api/axios'
import VetLayout from '../../components/VetLayout'
import { getUser, setAuth, getToken } from '../../utils/auth'
import { validatePassword } from '../../utils/passwordValidation'
import PasswordStrengthIndicator from '../../components/PasswordStrengthIndicator'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function Settings() {
  const [profile, setProfile] = useState(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [email, setEmail] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const isMobile = useIsMobile()
  const fileInputRef = useRef(null)

  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [photoSaving, setPhotoSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  const { allValid: newPasswordValid } = validatePassword(newPassword)
  const passwordsMatch = newPassword && newPassword === confirmPassword
  const canSubmitPassword = newPasswordValid && passwordsMatch

  const loadProfile = () => {
    return api.get('/settings').then(res => {
      const data = res.data.data
      setProfile(data)
      setFirstName(data.first_name)
      setLastName(data.last_name)
      setMobileNumber(data.mobile_number || '')
      setEmail(data.email || '')
      return data
    })
  }

  useEffect(() => { loadProfile() }, [])

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileLoading(true)

    try {
      const formData = new FormData()
      formData.append('first_name', firstName)
      formData.append('last_name', lastName)
      formData.append('mobile_number', mobileNumber)
      if (email) formData.append('email', email)

      await api.post('/settings/profile', formData, {
        params: { _method: 'PUT' },
      })

      const updated = await loadProfile()

      const user = getUser()
      setAuth(getToken(), { ...user, first_name: updated.first_name, last_name: updated.last_name })

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
    setMobileNumber(profile.mobile_number || '')
    setEmail(profile.email || '')
    setIsEditing(false)
    setProfileError('')
  }

  const openPhotoModal = () => {
    setPhotoFile(null)
    setPhotoError('')
    setShowPhotoModal(true)
  }

  const closePhotoModal = () => {
    setShowPhotoModal(false)
    setPhotoFile(null)
    setPhotoError('')
  }

  const handleSavePhoto = async () => {
    if (!photoFile) {
      setPhotoError('Please choose a photo first.')
      return
    }

    setPhotoError('')
    setPhotoSaving(true)

    try {
      const formData = new FormData()
      formData.append('first_name', profile.first_name)
      formData.append('last_name', profile.last_name)
      formData.append('mobile_number', profile.mobile_number || '')
      if (profile.email) formData.append('email', profile.email)
      formData.append('profile_photo', photoFile)

      await api.post('/settings/profile', formData, {
        params: { _method: 'PUT' },
      })

      await loadProfile()
      setShowPhotoModal(false)
      setPhotoFile(null)
      setProfileSuccess('Profile photo updated successfully.')
    } catch (err) {
      setPhotoError(err.response?.data?.message || 'Failed to upload photo. Please try again.')
    } finally {
      setPhotoSaving(false)
    }
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!newPasswordValid) {
      setPasswordError('New password does not meet all requirements.')
      return
    }

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
  const photoModalPreview = photoFile ? URL.createObjectURL(photoFile) : profile.profile_photo_url

  return (
    <VetLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Settings</h1>
      <p style={styles.pageSubtitle}>Manage your account and personal information.</p>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <h3 style={styles.sectionTitle}>Profile Photo</h3>

        {profileSuccess && <div style={styles.successBox}>{profileSuccess}</div>}

        <div style={styles.photoBlock}>
          <div style={{ ...styles.photoRow, ...(isMobile ? styles.photoRowMobile : {}) }}>
            <div style={styles.photoCircleWrap}>
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt="Profile" style={styles.photoCircleImg} />
              ) : (
                <div style={styles.photoCirclePlaceholder}>{initials}</div>
              )}
              <span style={styles.photoCameraBadge} onClick={openPhotoModal}>
                <CameraIcon />
              </span>
            </div>

            <div style={styles.photoInfo}>
              <div style={styles.photoName}>{profile.first_name} {profile.last_name}</div>
              <div style={styles.photoRole}>Municipal Veterinarian</div>
              {profile.email && <div style={styles.photoMeta}>{profile.email}</div>}
              {profile.mobile_number && <div style={styles.photoMeta}>{profile.mobile_number}</div>}
            </div>
          </div>

          <button type="button" onClick={openPhotoModal} style={styles.changePhotoBtn}>
            <UploadIcon /> Change Photo
          </button>
          <div style={styles.photoHint}>JPG, PNG up to 5MB</div>
        </div>
      </div>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Personal Information</h3>
          {!isEditing && (
            <button type="button" onClick={() => setIsEditing(true)} style={styles.editBtn}>
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

          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={!isEditing}
                placeholder={isEditing ? 'Optional' : ''}
                style={{ ...styles.input, ...(!isEditing ? styles.inputDisabled : {}) }}
              />
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
                onClick={handleCancelEdit}
                style={{ ...styles.cancelBtn, ...(isMobile ? styles.btnFull : {}) }}
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>

      <div style={{ ...styles.card, ...(isMobile ? styles.cardMobile : {}) }}>
        <h3 style={styles.sectionTitle}>Change Password</h3>
        <form onSubmit={handlePasswordSave}>
          {passwordError && <div style={styles.errorBox}>{passwordError}</div>}
          {passwordSuccess && <div style={styles.successBox}>{passwordSuccess}</div>}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Current Password</label>
            <div style={styles.passwordWrapper}>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                style={styles.input}
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div style={{ ...styles.row, ...(isMobile ? styles.rowMobile : {}) }}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>New Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  style={styles.input}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                  {showNew ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <PasswordStrengthIndicator password={newPassword} />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm New Password</label>
              <div style={styles.passwordWrapper}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={styles.input}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <div style={styles.mismatchText}>Passwords do not match.</div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={passwordLoading || !canSubmitPassword}
            style={{
              ...styles.saveBtn,
              ...(isMobile ? styles.btnFull : {}),
              opacity: (passwordLoading || !canSubmitPassword) ? 0.5 : 1,
              cursor: (passwordLoading || !canSubmitPassword) ? 'not-allowed' : 'pointer',
            }}
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {showPhotoModal && (
        <div style={modalStyles.overlay} onClick={closePhotoModal}>
          <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={modalStyles.title}>Edit Profile Photo</h3>

            {photoError && <div style={styles.errorBox}>{photoError}</div>}

            <div style={modalStyles.previewWrap}>
              {photoModalPreview ? (
                <img src={photoModalPreview} alt="Preview" style={modalStyles.previewImg} />
              ) : (
                <div style={modalStyles.previewPlaceholder}>{initials}</div>
              )}
            </div>

            <label style={styles.label}>Choose a new photo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={e => setPhotoFile(e.target.files?.[0] || null)}
              style={styles.input}
            />

            <div style={modalStyles.actions}>
              <button type="button" onClick={closePhotoModal} style={styles.cancelBtn}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={photoSaving || !photoFile}
                style={{
                  ...styles.saveBtn,
                  opacity: (photoSaving || !photoFile) ? 0.5 : 1,
                  cursor: (photoSaving || !photoFile) ? 'not-allowed' : 'pointer',
                }}
              >
                {photoSaving ? 'Saving...' : 'Save Photo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </VetLayout>
  )
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#6b7280">
      <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#6b7280">
      <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
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
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  pageSubtitle: { fontSize: '13.5px', color: '#6b7280', marginTop: '4px', marginBottom: '24px' },

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

  photoBlock: { display: 'flex', flexDirection: 'column' },
  photoRow: { display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '18px' },
  photoRowMobile: { gap: '14px' },
  photoInfo: { display: 'flex', flexDirection: 'column' },
  photoCircleWrap: { position: 'relative', flexShrink: 0 },
  photoCircleImg: { width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', display: 'block' },
  photoCirclePlaceholder: {
    width: '84px', height: '84px', borderRadius: '50%', backgroundColor: '#2E7D32',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '26px', fontWeight: '700',
  },
  photoCameraBadge: {
    position: 'absolute', bottom: 0, right: 0, width: '26px', height: '26px', borderRadius: '50%',
    backgroundColor: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', border: '2px solid white',
  },
  photoName: { fontSize: '17px', fontWeight: '700', color: '#111827' },
  photoRole: { fontSize: '13.5px', color: '#6b7280', marginTop: '3px' },
  photoMeta: { fontSize: '13px', color: '#374151', marginTop: '6px' },
  changePhotoBtn: {
    backgroundColor: 'white', color: '#2E7D32', border: '1px solid #2E7D32',
    borderRadius: '8px', padding: '9px 16px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '7px', width: 'fit-content',
  },
  photoHint: { fontSize: '11.5px', color: '#9ca3af', marginTop: '8px' },

  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  rowMobile: { gridTemplateColumns: '1fr', gap: '0px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', width: '100%',
  },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },
  passwordWrapper: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
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
  mismatchText: { fontSize: '12px', color: '#dc2626', marginTop: '2px' },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px',
  },
  modal: {
    backgroundColor: 'white', borderRadius: '14px', padding: '24px',
    width: '400px', maxWidth: '100%', boxSizing: 'border-box',
  },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '16px' },
  previewWrap: { display: 'flex', justifyContent: 'center', marginBottom: '16px' },
  previewImg: { width: '110px', height: '110px', borderRadius: '50%', objectFit: 'cover' },
  previewPlaceholder: {
    width: '110px', height: '110px', borderRadius: '50%', backgroundColor: '#2E7D32',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '32px', fontWeight: '700',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' },
}