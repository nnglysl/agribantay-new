const farmInput = farm => Object.fromEntries([
  'farm_name', 'farm_size', 'house_count', 'barangay', 'lot_number', 'street', 'landmark', 'latitude', 'longitude',
].filter(key => farm[key] != null).map(key => [key, farm[key]]))

function ownerData(owner, photo) {
  const body = new FormData()
  for (const key of ['first_name', 'last_name', 'mobile_number', 'email', 'address']) {
    if (owner[key]) body.append(key, owner[key])
  }
  if (photo) body.append('profile_photo', photo)
  return body
}

export function validateOwnerDetails(api, owner, photo) {
  return api.post('/admin/farm-owners/validate', ownerData(owner, photo))
}

export function registerOwnerWithFarms(api, owner, photo, farms) {
  const body = ownerData(owner, photo)
  farms.forEach((farm, index) => {
    for (const [key, value] of Object.entries(farmInput(farm))) body.append(`farms[${index}][${key}]`, value)
  })
  return api.post('/admin/farm-owners', body)
}

export function addFarmsToOwner(api, ownerId, farms) {
  return api.post('/admin/farms', { farm_owner_id: ownerId, farms: farms.map(farmInput) })
}
