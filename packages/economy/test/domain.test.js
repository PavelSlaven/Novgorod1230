import test from 'node:test';
import assert from 'node:assert/strict';
import * as economy from '../src/index.js';
import { quoteLocalAmount, renderLocalAmount } from '../src/index.js';

const day = '1230-06-01';

test('the initial public surface contains conversion and rendering only', () => {
  assert.deepEqual(Object.keys(economy).sort(), ['quoteLocalAmount', 'renderLocalAmount']);
});

function view({ rates, quantum = { unitId: 'cu_target', numerator: '1', denominator: '1', approval: 'approved' }, labels } = {}) {
  return {
    rates: rates ?? [
      rate('cu_source', '2', '3'),
      rate('cu_target', '5', '7')
    ],
    displayQuantums: quantum ? [quantum] : [],
    unitLabels: labels ?? [{ unitId: 'cu_target', text: 'целевой счёт', approval: 'approved' }]
  };
}

function rate(unitId, bueNumerator, bueDenominator, extra = {}) {
  return {
    unitId, regionId: 'region_novgorod_land', validFrom: '1200-01-01', validTo: '1240-12-31',
    bueNumerator, bueDenominator, approval: 'approved_with_limits',
    approvedScopes: [{ use: 'currency_conversion', regionId: 'region_novgorod_land', validFrom: '1200-01-01', validTo: '1240-12-31' }],
    ...extra
  };
}

function quote(options = {}) {
  return quoteLocalAmount({
    amount: { numerator: '1', denominator: '1' },
    fromUnitId: 'cu_source', toUnitId: 'cu_target',
    regionId: 'region_novgorod_land', date: day, economyView: view(),
    ...options
  });
}

test('two approved rate legs retain exact rational arithmetic until one final rounding', () => {
  const result = quote({ amount: { numerator: '1', denominator: '1' } });
  assert.equal(result.status, 'quoted');
  assert.deepEqual(result.exactAmount, { numerator: '14', denominator: '15' });
  assert.deepEqual(result.roundedAmount, { numerator: '1', denominator: '1' });
  assert.equal(renderLocalAmount({ quote: result, unitLabel: 'целевой счёт' }).text, '1 целевой счёт');
});

test('large values use BigInt without conversion through Number', () => {
  const n = '900719925474099312345678901';
  const result = quote({ amount: { numerator: n, denominator: '3' } });
  assert.equal(result.status, 'quoted');
  assert.equal(result.exactAmount.numerator, (BigInt(n) * 14n).toString());
  assert.equal(result.exactAmount.denominator, '45');
});

test('half-up rounds once to the approved quantum, including to zero', () => {
  const result = quote({
    amount: { numerator: '49', denominator: '100' },
    economyView: view({ rates: [rate('cu_source', '1', '1'), rate('cu_target', '1', '1')] })
  });
  assert.equal(result.status, 'quoted');
  assert.deepEqual(result.roundedAmount, { numerator: '0', denominator: '1' });
  assert.equal(renderLocalAmount({ quote: result, unitLabel: 'целевой счёт' }).text, '0 целевой счёт');
});

test('missing approved display quantum leaves even a small nonzero value unresolved', () => {
  const result = quote({
    amount: { numerator: '1', denominator: '1000' },
    economyView: view({ rates: [rate('cu_source', '1', '1'), rate('cu_target', '1', '1')], quantum: null })
  });
  assert.equal(result.status, 'unresolved');
});

test('invalid rational amounts and JavaScript numbers are rejected', () => {
  assert.equal(quote({ amount: { numerator: '1', denominator: '0' } }).status, 'invalid');
  assert.equal(quote({ amount: { numerator: 1, denominator: '2' } }).status, 'invalid');
  assert.equal(quote({ amount: { numerator: '-1', denominator: '2' } }).status, 'invalid');
});

test('exact dates include period endpoints and do not fall back to adjacent days', () => {
  const rates = [
    rate('cu_source', '2', '3', { validFrom: '1230-01-01', validTo: '1230-06-01' }),
    rate('cu_target', '5', '7')
  ];
  assert.equal(quote({ economyView: view({ rates }) }).status, 'quoted');
  assert.equal(quote({ date: '1230-06-02', economyView: view({ rates }) }).status, 'unresolved');
  assert.equal(quote({ date: '1230-02-30' }).status, 'invalid');
});

test('region and unit matching are exact', () => {
  assert.equal(quote({ regionId: 'region_pskov' }).status, 'unresolved');
  assert.equal(quote({ fromUnitId: 'cu_neighbor' }).status, 'unresolved');
});

test('missing legs and rows outside an approved limited scope are unresolved', () => {
  assert.equal(quote({ economyView: view({ rates: [rate('cu_source', '2', '3')] }) }).status, 'unresolved');
  const limited = rate('cu_source', '2', '3', {
    approvedScopes: [{ use: 'currency_conversion', regionId: 'region_novgorod_land', validFrom: '1231-01-01', validTo: '1240-12-31' }]
  });
  assert.equal(quote({ economyView: view({ rates: [limited, rate('cu_target', '5', '7')] }) }).status, 'unresolved');
});

test('compatible overlaps with equal rational values quote in either row order', () => {
  const one = rate('cu_source', '1', '1', { approval: 'approved' });
  const equivalent = rate('cu_source', '2', '2', { approval: 'approved' });
  const target = rate('cu_target', '1', '1', { approval: 'approved' });
  for (const sourceRates of [[one, equivalent], [equivalent, one]]) {
    const result = quote({ economyView: view({ rates: [...sourceRates, target] }) });
    assert.equal(result.status, 'quoted');
    assert.deepEqual(result.exactAmount, { numerator: '1', denominator: '1' });
  }
});

test('compatible approved and rejected duplicates use only the approved row', () => {
  const approved = rate('cu_source', '2', '2', { approval: 'approved' });
  const rejected = rate('cu_source', '1', '1', { approval: 'rejected' });
  const target = rate('cu_target', '1', '1', { approval: 'approved' });
  for (const sourceRates of [[approved, rejected], [rejected, approved]]) {
    assert.equal(quote({ economyView: view({ rates: [...sourceRates, target] }) }).status, 'quoted');
  }
});

test('overlapping 50/40 style limited rows conflict before scope filtering', () => {
  const conflict = rate('cu_source', '17063', '25', { approvedScopes: [] });
  const accepted = rate('cu_source', '51189', '250');
  for (const sourceRates of [[accepted, conflict], [conflict, accepted]]) {
    assert.equal(quote({ economyView: view({ rates: [...sourceRates, rate('cu_target', '1', '1')] }) }).status, 'conflict');
  }
});

test('gap, rejected, and quarantined rows do not produce a quote', () => {
  for (const approval of ['gap', 'rejected', 'quarantined']) {
    const rates = [rate('cu_source', '2', '3', { approval }), rate('cu_target', '5', '7')];
    assert.equal(quote({ economyView: view({ rates }) }).status, 'unresolved');
  }
});

test('render requires the quote-bound exact target label and emits no metadata', () => {
  const result = quote();
  assert.equal(renderLocalAmount({ quote: result, unitLabel: 'гривна серебра' }).status, 'invalid');
  assert.equal(renderLocalAmount({ quote: { ...result }, unitLabel: 'целевой счёт' }).status, 'invalid');
  const rendered = renderLocalAmount({ quote: result, unitLabel: 'целевой счёт' });
  assert.deepEqual(Object.keys(rendered).sort(), ['status', 'text']);
  assert.equal(JSON.stringify(rendered).includes('BUE'), false);
  assert.equal(JSON.stringify(rendered).includes('source'), false);
});

test('malformed render inputs return invalid without throwing', () => {
  for (const input of [undefined, null, 1, 'quote', [], { quote: null }, { quote: {}, unitLabel: 1 }]) {
    assert.doesNotThrow(() => assert.equal(renderLocalAmount(input).status, 'invalid'));
  }
});

test('duplicate quantum or target labels are reported as conflicts', () => {
  const duplicateQuantum = view();
  duplicateQuantum.displayQuantums.push({ ...duplicateQuantum.displayQuantums[0] });
  assert.equal(quote({ economyView: duplicateQuantum }).status, 'conflict');
  const duplicateLabel = view();
  duplicateLabel.unitLabels.push({ ...duplicateLabel.unitLabels[0] });
  assert.equal(quote({ economyView: duplicateLabel }).status, 'conflict');
});

test('nonterminating decimal quantum result cannot be rendered as a fraction', () => {
  const result = quote({
    amount: { numerator: '1', denominator: '3' },
    economyView: view({
      rates: [rate('cu_source', '1', '1'), rate('cu_target', '1', '1')],
      quantum: { unitId: 'cu_target', numerator: '1', denominator: '3', approval: 'approved' }
    })
  });
  assert.equal(result.status, 'quoted');
  assert.equal(renderLocalAmount({ quote: result, unitLabel: 'целевой счёт' }).status, 'unresolved');
});
