import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessPrimaryReading, assessFarmDevices, isPrimaryValue } from '../src/utils/primaryMonitoring.js'
const device = (extra={})=>({has_reading:true,connectivity:'Online',ammonia:5,moisture:12,ammonia_status:'Safe',moisture_status:'Safe',...extra})
for(const metric of ['ammonia','moisture']) for(const status of ['Safe','Warning','Critical']) {
  test(`${metric} missing with valid other ${status} retains severity and incomplete coverage`,()=>{
    const other=metric==='ammonia'?'moisture':'ammonia'
    const d=device({[metric]:null,[`${metric}_status`]:'Critical',[`${other}_status`]:status})
    const expected=status==='Safe'?'Incomplete Data':status
    const a=assessPrimaryReading(d); assert.equal(a.condition,expected); assert.equal(a.incomplete_data,true)
    assert.equal(assessFarmDevices([d]).condition,expected)
  })
}
test('both missing, supporting-only readings, offline and Pending Setup cannot become Safe',()=>{
  const empty=device({ammonia:null,moisture:null,temperature:99,temperature_status:'Critical'})
  assert.equal(assessFarmDevices([empty]).condition,'No Readings Yet')
  assert.equal(assessFarmDevices([device({connectivity:'Offline'})]).condition,'Offline')
  assert.equal(assessFarmDevices([]).condition,'Pending Setup')
})
test('mixed-house severity uses valid current measurements and retains completeness independently',()=>{
  const a=assessFarmDevices([device(),device({ammonia:null,moisture_status:'Warning'}),device({connectivity:'Offline',ammonia_status:'Critical'})])
  assert.equal(a.condition,'Warning'); assert.equal(a.incomplete_data,true); assert.equal(a.complete_devices,1)
  assert.equal(assessFarmDevices([device(),device({ammonia:null,moisture_status:'Critical'})]).condition,'Critical')
})
test('zeros are complete while malformed numeric strings and unknown statuses are unavailable',()=>{
  assert.equal(assessPrimaryReading(device({ammonia:0,moisture:'0.00'})).condition,'Safe')
  for(const value of [null,undefined,false,'','  ','unknown','0x10',NaN,Infinity]) assert.equal(isPrimaryValue(value),false)
  assert.equal(assessPrimaryReading(device({ammonia_status:'constructor'})).condition,'Incomplete Data')
})
