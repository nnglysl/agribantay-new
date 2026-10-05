// Service request types as stored in service_requests.service_type.
// Mirrors backend App\Support\ServiceTypes.
//
// "Vaccine Request" was replaced by "Farm Biosecurity Request" as the
// Veterinarian's active service. Rows stored with the old value stay
// visible (and filterable where a page lists every type) but it is never
// offered for a new request.
export const FARM_BIOSECURITY = 'Farm Biosecurity Request'
export const BLOOD_TEST = 'Blood Test Request'
export const ODOR_CONTROL = 'Odor Control Request'
export const FLY_CONTROL = 'Fly Control Request'
export const VACCINE_LEGACY = 'Vaccine Request'

/** Handled by the Veterinarian (current types first, legacy last). */
export const VET_TYPES = [FARM_BIOSECURITY, BLOOD_TEST, VACCINE_LEGACY]
/** The Vet's current services — what filters and new requests offer. */
export const VET_ACTIVE_TYPES = [FARM_BIOSECURITY, BLOOD_TEST]
/** Handled by LGU Staff. */
export const STAFF_TYPES = [ODOR_CONTROL, FLY_CONTROL]
/** What a farmer may submit today. */
export const REQUESTABLE_TYPES = [FARM_BIOSECURITY, BLOOD_TEST, ODOR_CONTROL, FLY_CONTROL]
/** Every value that can appear on a row, for pages that list all history. */
export const ALL_TYPES = [ODOR_CONTROL, FLY_CONTROL, FARM_BIOSECURITY, BLOOD_TEST, VACCINE_LEGACY]

// Attachment rules shared with the backend (Vet\VaccinationRequestController).
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
/** Per request, uploaded files and captured photos combined. */
export const ATTACHMENT_MAX_FILES = 5
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
export const ATTACHMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png']
