import { createContext } from 'react'

// Plain context object, kept in its own non-component file — FarmProvider
// (the component) and useSelectedFarm (the hook) both read this, but a
// component file exporting anything else breaks Fast Refresh.
const FarmContext = createContext(null)

export default FarmContext
