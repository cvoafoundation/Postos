import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = ts.transpileModule(fs.readFileSync('src/lib/postHealth.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { computePostHealth } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const date = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
const inputs = { post: { created_at: date(300), charter_date: date(300) }, foundingTeam: [], sponsors: [], meetingDates: [], recruits: [], members: [], hasDelegate: false, delegateVotesCast: 0, governanceSignatures: [], annualReview: null, communityServiceEvents: [], financialTransactions: [] }
test('recent published minutes improve the meeting signal and composite', () => {
  const before = computePostHealth(inputs)
  const after = computePostHealth({ ...inputs, meetingDates: [date(1)] })
  assert.equal(after.dimensions.find(d => d.key === 'meetings').status, 'green')
  assert.ok(after.score > before.score)
})
test('future meeting dates cannot make an overdue post look compliant', () => {
  const result = computePostHealth({ ...inputs, meetingDates: [date(70), date(-30)] })
  assert.equal(result.dimensions.find(d => d.key === 'meetings').status, 'red')
})
test('calculating health preserves the caller’s meeting records', () => {
  const meetingDates = [date(1), date(70)]
  const original = [...meetingDates]
  computePostHealth({ ...inputs, meetingDates })
  assert.deepEqual(meetingDates, original)
})
