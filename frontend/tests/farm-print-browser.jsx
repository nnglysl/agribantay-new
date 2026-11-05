import './annual-compliance-browser.jsx'
import api from '../src/api/axios'
import { PRINT_SECTIONS } from '../src/utils/farmPrint'
import { makePrintFixture } from './farm-print-fixture'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
for (let i=0;i<2000&&!window.phase8Results;i++) await sleep(20)
const passed=[], calls=[], tickets=new Map()
const control={count:1001,mode:'normal',fail:false,delay:5,documents:true,oversized:false,longHistory:false}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
try {
  assert(window.phase8Results&&!window.phase8Results.error,window.phase8Results?.error||'Earlier browser regressions must pass first')
  const {render,click:baseClick,button:baseButton,wait,text,getRole,runtimeErrors,unexpected}=window.phase7Harness
  const button=label=>document.querySelector('.fp-dialog')?[...document.querySelectorAll('.fp-dialog button')].find(element=>element.textContent.trim()===label):baseButton(label)
  const click=label=>{const target=button(label);assert(target,'Missing print control: '+label);target.click()}
  const originalGet=api.get, originalPost=api.post
  api.get=async(url,options)=>{
    if(!url.endsWith('/print-options'))return originalGet(url,options)
    const id=Number(url.split('/')[3]);calls.push({url})
    return {data:{data:{farm:makePrintFixture({farmId:id}).manifest.farm,sections:Object.entries(PRINT_SECTIONS).map(([key,label])=>({key,label,available:key!=='documents'||control.documents,reason:key==='documents'&&!control.documents?'Document setup is pending.':null})),max_preview_rows:20000,batch_size:500}}}
  }
  api.post=async(url,body,options={})=>{
    if(!/\/print-(preview|batch)$/.test(url))return originalPost(url,body,options)
    calls.push({url,body:structuredClone(body)});const captured={...control};await sleep(captured.delay)
    if(options.signal?.aborted){const error=Error('Canceled');error.code='ERR_CANCELED';throw error}
    if(captured.fail&&url.endsWith('/print-batch')){const error=Error('Synthetic batch failure');error.response={status:503,data:{message:'Synthetic batch failure; nothing printed.'}};throw error}
    if(url.endsWith('/print-preview')){
      if(captured.oversized){const error=Error('Oversized report');error.response={status:422,data:{errors:{sections:['This selection contains 20001 rows. Browser preview supports up to 20000 rows per document to protect browser memory. Narrow the date range or select fewer sections; no records were truncated.']}}};throw error}
      const fixture=makePrintFixture({farmId:Number(url.split('/')[3]),sections:body.sections,role:getRole(),count:captured.count,mode:captured.mode,range:{mode:body.date_mode,from:body.from||null,to:body.to||null}})
      if(captured.longHistory){fixture.records.inspections=Array.from({length:65},(_,i)=>({...fixture.records.inspections[0],id:i+1,findings:`Recorded inspection ${i+1}: `+'Historical findings retained in full. '.repeat(6)}));fixture.manifest.total_rows+=63;fixture.manifest.streams.inspections={total:65,max_id:65}}
      fixture.manifest.ticket='private-fixture-ticket-'+tickets.size;tickets.set(fixture.manifest.ticket,fixture);return {data:{data:fixture.manifest}}
    }
    const fixture=tickets.get(body.ticket),rows=fixture.records[body.section].filter(row=>row.id>body.after_id),items=rows.slice(0,500)
    return {data:{data:{farm_id:captured.mode==='wrong-farm'?99:fixture.manifest.farm.id,section:body.section,items,has_more:rows.length>500,next_after_id:items.at(-1)?.id||body.after_id,expected_total:fixture.manifest.streams[body.section].total}}}
  }
  const frame=()=>document.querySelector('.fp-preview-frame')
  const doc=()=>frame()?.contentDocument
  const setField=(selector,value)=>{const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}))}
  const open=async(role='admin',farmId=1)=>{await render({role,farmId});assert(baseButton('Print'),'Authorized farm header needs compact Print action');baseClick('Print');await wait(()=>document.querySelector('.fp-config select'))}
  const preview=async()=>{click('Preview');await wait(()=>frame()&&doc()?.querySelector('.fp-document')&&!button('Print')?.disabled)}
  await open();assert(button('Print').disabled,'Print requires a complete ready preview')
  assert(!document.querySelector('.fp-dialog input[type="checkbox"]')&&!button('Select All')&&!button('Clear Selection'),'No record selection controls')
  assert(document.querySelectorAll('.fp-dialog select').length===1&&document.querySelector('[aria-label="Print date range"]').value==='all'&&document.querySelector('#fp-title').textContent==='Print Farm Records'&&!document.querySelector('.fp-format')&&!document.querySelector('.fp-dialog').textContent.includes('Portrait'),'Modal retains its title and date range without paper preferences')
  assert(document.querySelector('.fp-help').textContent==='All available farm records will be included automatically.'&&!document.querySelector('.fp-dialog').textContent.includes('20,000'),'Default view has concise, nontechnical copy')
  assert([...document.querySelectorAll('.fp-dialog-actions button')].map(element=>element.textContent).join('|')==='Preview|Print|Cancel'&&document.querySelector('.fp-dialog-header p').textContent==='Calansayan Poultry Farm · Farm ID: 1','Requested action order and farm identity')
  passed.push('Compact Print action opens the farm-specific modal with automatic sections and date range, without paper preferences')
  await preview()
  assert([...doc().styleSheets].every(sheet=>[...sheet.cssRules].every(rule=>rule.type!==6)),'Print document leaves paper size, orientation and margins to the native dialog')
  assert(doc().querySelectorAll('[data-section="readings"] tbody tr').length===4&&doc().body.textContent.includes('1,001 matching historical readings'),'All 1001 readings summarized into four metric rows')
  assert(!doc().body.textContent.includes('private-fixture-ticket')&&!doc().body.textContent.includes('FIXTURE-DEVICE-CREDENTIAL')&&!doc().querySelector('nav,button,a'),'No credentials, links or dashboard controls in print document')
  assert(calls.filter(call=>call.url.endsWith('/print-batch')&&call.body.section==='readings').length===3,'Controlled 500-row batching')
  assert(doc().querySelectorAll('h2').length===12&&Object.keys(PRINT_SECTIONS).every(key=>calls.find(call=>call.url.endsWith('/print-preview')).body.sections.includes(key)),'Every available section requested and rendered')
  assert(doc().querySelector('.rl-head')&&doc().querySelectorAll('.rl-brand img').length===2&&doc().querySelector('.print-signatures'),'Shared Reports branding and footer')
  assert(doc().querySelectorAll('[data-section="inspections"] tbody tr').length===2&&doc().body.textContent.includes('Historical retired service: Odor Control Request')&&!doc().body.textContent.includes('Blood Test Request'),'Complete original Staff records retain role-specific service history')
  passed.push('Complete verified batches produce sensor summaries and all original permitted history with Reports branding')
  let prints=0;frame().contentWindow.print=()=>{prints++};click('Print');await sleep(20)
  assert(prints===1&&text().includes('If you cancel its dialog')&&frame(),'Print invokes frame native-print entry point and preserves canceled preview')
  passed.push('Print action invokes the isolated document window and retains preview after dialog cancellation')
  setField('[aria-label="Print date range"]','custom');await sleep(20);setField('[aria-label="Print From Date"]','2026-11-02');setField('[aria-label="Print To Date"]','2026-11-01');await sleep(20)
  const before=calls.length;click('Preview');await wait(()=>document.querySelector('.fp-error'));assert(calls.length===before&&!frame(),'Reversed date range must fail before requests')
  setField('[aria-label="Print From Date"]','2026-10-31');setField('[aria-label="Print To Date"]','2026-10-31');await sleep(20);await preview()
  assert(doc().body.textContent.includes('2026-10-31 to 2026-10-31')&&doc().body.textContent.includes('Current compliance as of'),'Date filter and current snapshot are clearly distinguished')
  passed.push('Custom dates validate before requests and historical filters retain explicitly labelled current snapshots')
  click('Cancel');control.fail=true;await open();click('Preview');await wait(()=>text().includes('Synthetic batch failure'));assert(button('Print').disabled&&!frame(),'Failed batch must never print partial data');click('Cancel');control.fail=false
  control.delay=120;await open();click('Preview');await sleep(10);setField('[aria-label="Print date range"]','custom');await sleep(300);assert(!frame()&&button('Print').disabled,'Old canceled generation must not restore a preview');click('Cancel');control.delay=5
  passed.push('Batch errors and changed date ranges cannot expose partial or stale previews')
  control.count=2;control.mode='offline';await open('super_admin');await preview();assert(doc().body.textContent.includes('Historical last reading')&&!doc().body.textContent.includes('Current condition: Safe'),'Offline must not claim Safe');assert(doc().body.textContent.includes('Blood Test Request')&&doc().querySelectorAll('.print-signatures > div').length===1,'Super Admin keeps Vet history and the shared Head footer');click('Cancel')
  control.mode='unknown';await open('super_admin',2);await preview();assert(doc().body.textContent.includes('Second Owner Farm')&&doc().body.textContent.includes('Undetermined')&&!doc().body.textContent.includes('Calansayan Poultry Farm'),'Missing dates and alternate farm stay isolated');click('Cancel')
  control.mode='unassigned';await open();await preview();assert(doc().body.textContent.includes('Pending device setup'),'Unassigned is not Safe');click('Cancel')
  control.mode='incomplete';await open();await preview();assert(doc().body.textContent.includes('Farm condition: Warning')&&doc().body.textContent.includes('Incomplete Data')&&doc().body.textContent.includes('Not assessed (stored status: Safe)'),'Print preserves abnormal severity and labels missing historic values');click('Cancel');control.mode='normal'
  passed.push('Offline, unassigned, missing-compliance dates and another selected farm have honest isolated states')
  control.documents=false;await open();assert(!document.querySelector('.fp-warning'),'No unavailable-source warning in the default view');await preview();assert(document.querySelector('.fp-warning')?.textContent.includes('Control Document Records'),'Unavailable sources disclosed with the preview');assert(!doc().querySelector('[aria-label="Control Document Records"]'),'Unavailable section not printed');click('Cancel');control.documents=true
  control.mode='empty';await open();await preview();assert(doc().body.textContent.includes('No matching records'),'Empty available section is explicit');click('Cancel');control.mode='normal'
  control.oversized=true;await open();click('Preview');await wait(()=>document.querySelector('.fp-error'));assert(button('Print').disabled&&!frame()&&text().includes('complete report contains 20001')&&text().includes('Choose a narrower date range')&&!text().includes('select fewer sections'),'Oversized complete report warns and cannot print or truncate');click('Cancel');control.oversized=false
  passed.push('Unavailable sources are excluded and empty or oversized complete reports have explicit states')
  await render({page:'manure'});assert(!baseButton('Print'),'No new Farmer print permission');await render({page:'services'});assert(!text().includes('Legacy Odor/Fly Records'),'Farmer legacy interface remains removed')
  passed.push('Farmer permissions and Phase 6–8 browser regressions remain intact')
  assert(runtimeErrors.length===0&&unexpected.length===0,'No runtime or unmocked API errors: '+runtimeErrors.join(','))
  window.phase9Open=open
  window.phase9Diagnostics=()=>runtimeErrors
  window.phase9Header=async()=>{await render({role:'admin'});return true}
  window.phase9DocumentHtml=()=> '<!doctype html>'+doc().documentElement.outerHTML.replace('<head>',`<head><base href="${location.origin}">`)
  window.phase9Preview=async({role='super_admin',count=65,longHistory=false}={})=>{control.count=count;control.mode='normal';control.fail=false;control.longHistory=longHistory;await open(role);await preview();return true}
  window.phase9Results={passed}
}catch(error){window.phase9Results={passed,error:error.stack}}
