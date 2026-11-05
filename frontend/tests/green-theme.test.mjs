import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { GREEN } from '../src/theme/green.js'

function contrast(first, second) {
  const luminance = color => {
    const channels = color.replace('#','').match(/../g).map(channel => parseInt(channel,16)/255)
      .map(channel => channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4)
    return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722
  }
  const values=[luminance(first),luminance(second)].sort((a,b)=>b-a)
  return (values[0]+.05)/(values[1]+.05)
}

test('shared green keeps the exact Staff summary reference in JavaScript and CSS', async () => {
  const css=await readFile(new URL('../src/styles/green.css',import.meta.url),'utf8')
  assert.equal(GREEN.primary,'#234A35')
  assert.ok(css.includes(`--agb-green: ${GREEN.primary};`))
  assert.ok(css.includes(`--agb-green-hover: ${GREEN.hover};`))
  assert.ok(css.includes(`--agb-green-soft: ${GREEN.soft};`))
})

test('primary, hover and semantic green text retain readable contrast', () => {
  assert.ok(contrast(GREEN.primary,'#ffffff')>=4.5,'White button text on primary')
  assert.ok(contrast(GREEN.hover,'#ffffff')>=4.5,'White text in hover state')
  assert.ok(contrast(GREEN.primary,GREEN.soft)>=4.5,'Dark green on a subtle green status background')
  assert.ok(contrast(GREEN.focus,'#ffffff')>=3,'Keyboard focus on white surfaces')
  assert.ok(contrast(GREEN.onDark,'#14301c')>=4.5,'Existing light accents on dark navigation')
})
