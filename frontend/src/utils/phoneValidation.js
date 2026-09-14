const PH_MOBILE_REGEX = /^09\d{9}$/
const PH_MOBILE_MAX_LENGTH = 11

export function isValidPhoneNumber(value) {
  return PH_MOBILE_REGEX.test((value || '').trim())
}

// Strips everything but digits and hard-caps at 11 characters — meant to be
// run on every keystroke (onChange) so a Philippine mobile number field can
// never even contain a letter, space, or a 12th digit in the first place.
export function sanitizePhoneInput(value) {
  return (value || '').replace(/\D/g, '').slice(0, PH_MOBILE_MAX_LENGTH)
}

export const PHONE_VALIDATION_MESSAGE = 'Please enter a valid Philippine mobile number (e.g. 09171234567).'
export const PHONE_INCOMPLETE_MESSAGE = 'Mobile number is incomplete. It must be 11 digits (e.g. 09171234567).'
