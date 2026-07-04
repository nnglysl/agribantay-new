export function validatePassword(password) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  }

  const passedCount = Object.values(checks).filter(Boolean).length
  const allValid = passedCount === 5

  let strength = 'Weak'
  if (passedCount >= 5) strength = 'Strong'
  else if (passedCount >= 3) strength = 'Medium'

  return { checks, allValid, strength, passedCount }
}