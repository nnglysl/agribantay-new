import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import api from '../src/api/axios'
import { clearAllCache } from '../src/hooks/useCachedFetch'
import { useTableFetch } from '../src/hooks/useTableFetch'
import { DataTable } from '../src/components/ReportsLayout'

// This fixture intercepts every request. It cannot call an operational API.
const calls = []
let records = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: i === 22 ? 'Needle' : `Record ${i + 1}` }))
api.get = async (url, { params }) => {
  if (url !== '/_phase4-fixture') throw Error(`Unexpected API request: ${url}`)
  calls.push({ ...params })
  const filtered = records.filter(row => row.name.includes(params.search || ''))
  const page = Math.min(params.page, Math.max(1, Math.ceil(filtered.length / params.per_page)))
  await new Promise(resolve => setTimeout(resolve, params.page === 3 ? 120 : 15))
  return { data: { data: { items: filtered.slice((page - 1) * params.per_page, page * params.per_page),
    page, last_page: Math.max(1, Math.ceil(filtered.length / params.per_page)), total: filtered.length, query_key: params.query_key } } }
}

function Harness() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const { data, loading, refetch } = useTableFetch('/_phase4-fixture', { search }, page, 10, setPage)
  return <>
    <button id="page2" onClick={() => setPage(2)}>Page 2</button>
    <button id="page3" onClick={() => setPage(3)}>Page 3</button>
    <button id="filter" onClick={() => setSearch('Needle')}>Filter</button>
    <button id="clear" onClick={() => setSearch('')}>Clear</button>
    <button id="refresh" onClick={refetch}>Refresh</button>
    <output id="result">{JSON.stringify({ loading, page, total: data?.total, ids: data?.items.map(row => row.id) })}</output>
  </>
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await sleep(20) }
  throw Error('Browser assertion timed out: ' + document.body.textContent)
}
const state = () => JSON.parse(document.querySelector('#result').textContent)
const click = id => document.querySelector('#' + id).click()
const assert = (value, message) => { if (!value) throw Error(message) }
const root = createRoot(document.querySelector('#root'))
const passed = []
try {
  clearAllCache()
  root.render(<Harness />)
  await waitFor(() => document.querySelector('#result') && state().ids?.[0] === 1)
  click('page2')
  await waitFor(() => state().ids?.[0] === 11)
  click('refresh')
  await sleep(70)
  assert(state().page === 2 && state().ids[0] === 11, 'Polling/refetch must preserve the current page')
  passed.push('page navigation and refresh preserve page 2')

  click('filter')
  await waitFor(() => state().total === 1)
  assert(state().page === 1 && state().ids[0] === 23, 'Filter must find a record beyond page 1 and reset the page')
  assert(calls.filter(call => call.search === 'Needle').every(call => call.page === 1), 'No request for an obsolete page on filter change')
  passed.push('filter changes reset page before requesting and use filtered totals')

  click('clear')
  await waitFor(() => state().total === 25)
  click('page3')
  await sleep(25)
  click('filter')
  await waitFor(() => state().total === 1)
  await sleep(170)
  assert(state().ids[0] === 23 && state().page === 1, 'Delayed earlier response must not replace the current filter')
  passed.push('delayed previous-page responses cannot supply rows to a new filter')

  click('clear')
  await waitFor(() => state().total === 25)
  click('page3')
  await waitFor(() => state().ids?.[0] === 21)
  records = records.slice(0, 11)
  click('refresh')
  await waitFor(() => state().page === 2 && state().total === 11)
  assert(state().ids[0] === 11, 'Shrinking totals must use the server clamped page')
  passed.push('shrinking filtered results clamp to the last valid page')

  const rows = Array.from({ length: 25 }, (_, i) => [{ text: 'Row ' + (i + 1) }])
  root.render(<DataTable columns={['Name']} rows={rows} emptyText="Empty" resetKey="all" />)
  await waitFor(() => document.querySelector('[aria-label="Next"]'))
  document.querySelector('[aria-label="Next"]').click()
  await waitFor(() => document.querySelector('tbody')?.textContent.includes('Row 11'))
  root.render(<DataTable columns={['Name']} rows={rows} emptyText="Empty" resetKey="new-period" />)
  await waitFor(() => document.querySelector('[aria-current="page"]')?.textContent === '1')
  assert(document.querySelector('tbody td').textContent === 'Row 1', 'The first report row must be visible after the period changes')
  assert(document.querySelector('[aria-current="page"]').textContent === '1', 'Report period changes must reset pagination')
  passed.push('report period changes reset local summary-table pagination')

  root.render(<DataTable columns={['Name']} rows={[[{ text: 'Server row 11' }]]} emptyText="Empty"
    server={{ total: 25, page: 2, lastPage: 3, pageSize: 10, setPage: () => {}, setPageSize: () => {} }} />)
  await waitFor(() => document.querySelector('tbody')?.textContent.includes('Server row 11'))
  assert(document.querySelector('[aria-current="page"]').textContent === '2', 'Server tables must use server metadata without slicing the page again')
  passed.push('server report tables do not paginate an already paginated response twice')
  window.phase4Results = { passed }
} catch (error) {
  window.phase4Results = { passed, error: error.stack }
}
