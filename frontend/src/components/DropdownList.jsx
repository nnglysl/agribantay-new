/** Shared keyboard focus movement; option activation keeps its existing handler. */
export default function DropdownList({ children, className = '', ...props }) {
  const handleKeyDown = event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const current = event.target.closest?.('.agb-dropdown-option')
    if (!current || !event.currentTarget.contains(current)) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const options = [...event.currentTarget.querySelectorAll('.agb-dropdown-option')]
      .filter(option => !option.disabled && option.getAttribute('aria-disabled') !== 'true')
    const index = options.indexOf(current)
    if (index < 0) return
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
    event.preventDefault()
    options[next].focus()
  }

  return (
    <div {...props} className={`agb-dropdown-list ${className}`} onKeyDown={handleKeyDown}>
      {children}
    </div>
  )
}
