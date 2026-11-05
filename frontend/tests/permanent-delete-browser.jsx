import { createRoot } from 'react-dom/client'
import { DeleteFarmModal } from '../src/pages/superadmin/Farms'
import api from '../src/api/axios'
import '../src/index.css'

const root = createRoot(document.querySelector('#root'))
const calls = [], passed = []
let closed = 0, deleted = 0, blocked = false, renderKey = 0
const assert = (condition, message) => { if (!condition) throw Error(message) }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const wait = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(20) } throw Error('Fixture timed out') }
api.defaults.adapter = async config => {
  const body = JSON.parse(config.data || '{}')
  calls.push({ method: config.method, url: config.url, body })
  assert(body.permanently_discontinued === true && body.acknowledge_permanent_loss === true, 'Both confirmations accompany every request')
  assert(config.url.startsWith('/superadmin/farms/901'), 'Only the synthetic selected farm may be requested')
  if (blocked) {
    const error = Error('Protected Control Documents prevent deletion.')
    error.response = { data: { message: error.message }, status: 422 }
    throw error
  }
  if (config.method === 'delete') assert(body.code === '123456', 'The entered OTP must accompany final deletion')
  else assert(config.method === 'post', 'No unassignment or other mutation may be initiated by this modal')
  return { data: { success: true, message: config.method === 'post' ? 'A synthetic code was sent.' : 'Synthetic farm deleted.' }, status: 200, statusText: 'OK', headers: {}, config }
}
const button = text => [...document.querySelectorAll('button')].find(element => element.textContent === text)
const render = async (mobile = false) => {
  root.render(<DeleteFarmModal key={++renderKey} farm={{ id: 901, farm_name: 'Synthetic Farm', owner_name: 'Synthetic Owner', owner_farm_count: 2 }}
    isMobile={mobile} onClose={() => { closed++ }} onDeleted={() => { deleted++ }} />)
  await wait(() => button('Continue'))
}
try {
  await render()
  assert(button('Continue').disabled, 'Continue must require both confirmations')
  button('Cancel').click()
  assert(closed === 1 && calls.length === 0, 'Cancel must not issue any API request')
  passed.push('Cancel leaves data unchanged')
  let checks = document.querySelectorAll('input[type="checkbox"]')
  checks[0].click(); await sleep(30)
  assert(button('Continue').disabled, 'One confirmation is insufficient')
  checks[1].click(); await sleep(30)
  assert(!button('Continue').disabled, 'Both explicit confirmations enable Continue')
  blocked = true
  button('Continue').click()
  await wait(() => document.body.textContent.includes('Protected Control Documents'))
  assert(button('Continue') && deleted === 0 && calls.every(call => call.method === 'post'), 'An eligibility error must leave the confirmation open')
  passed.push('Explicit closure and permanent-loss confirmations gate OTP; protected-record errors remain visible')
  blocked = false
  button('Continue').click()
  await wait(() => button('Verify & Delete'))
  const digits = document.querySelectorAll('input')
  // OtpInput distributes a pasted code through its first digit input.
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '123456' } })
  digits[0].dispatchEvent(paste)
  await wait(() => !button('Verify & Delete').disabled)
  button('Verify & Delete').click()
  await wait(() => deleted === 1)
  assert(calls.filter(call => call.method === 'delete').length === 1, 'Final deletion is submitted once')
  assert(!calls.some(call => /unassign|houses/.test(call.url)), 'No automatic device or house mutation')
  passed.push('OTP submission carries both confirmations and performs no automatic unassignment')
  await render(true)
  assert(document.querySelectorAll('input[type="checkbox"]').length === 2 && button('Continue').disabled, 'Mobile dialog retains both required confirmations')
  passed.push('Mobile confirmation retains the same safety requirements')
  window.permanentDeleteResults = { passed }
} catch (error) {
  window.permanentDeleteResults = { error: error.stack, passed }
}
