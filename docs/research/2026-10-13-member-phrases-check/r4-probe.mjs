// Read-only probe for the #703 CR: real successor v2 records -> member selection -> join with member_phrases.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const W = '/srv/novgorod-work/worktrees/demo-d60f645eb';
const C = "d60f645eb";
const show = (p, ref = C) => execFileSync('git', ['show', `${ref}:${p}`], { cwd: W, maxBuffer: 1 << 28 }).toString('utf8');
const imp = (p) => import(`${W}/${p}`);
const { buildG4NaturalCompiledRecords } = await imp('tools/runtime-catalog-activation/src/g4-natural-compiled-records.js');
const { buildG4NaturalPresentationCompiledRecords } = await imp('tools/runtime-catalog-activation/src/g4-natural-presentation-compiled-records.js');
const { selectG4NaturalMembers } = await imp('packages/materialization/src/g4-natural-baseline.js');
const N = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
const P = 'data/world-catalogs/novgorod/m2c-natural-presentation/nature-successor-candidate-v2.json';
const approval = JSON.parse(show('data/world-catalogs/novgorod/m2c-natural/nature-successor-data-approval.json'));
const naturalBytes = show(N);
const approvedNatural = show(N, 'ae212e78');
const presBytes = show(P);
const approvedPres = show(P, 'ae212e78');
// natural bytes are approved by the v2-bytes approval; activation still takes the first approval + derived equality.
const naturalRecords = buildG4NaturalCompiledRecords({ candidateBytes: naturalBytes, approvedCandidateBytes: approvedNatural, approval });
const presRecords = buildG4NaturalPresentationCompiledRecords({ candidateBytes: presBytes, approvedCandidateBytes: approvedPres,
  naturalCandidateBytes: naturalBytes, approvedNaturalCandidateBytes: approvedNatural, approval, naturalRecords });
const out = { natural: naturalRecords.length, presentation: presRecords.length, rows: [], examples: [] };
const seasons = ['spring', 'summer', 'autumn', 'winter'];
let totSel = 0; let totWith = 0; let totNo = 0; let chanMismatch = 0; let emptyLayerSel = 0;
const noPhraseKinds = {};
for (const nrow of naturalRecords) {
  const prow = presRecords.find((r) => r.payload.natural_profile_ref.id === nrow.payload.profile_id);
  const prof = nrow.payload;
  const policy = prof.natural_profile.frequency_weight_policy;
  for (const season of seasons) {
    let sel;
    try {
      sel = selectG4NaturalMembers({ profile: prof, frequency_weight_policy: policy, party_id: 'party:probe', g5_site_id: 'g5:probe', season, eligible_member_refs: [] });
    } catch (e) { out.rows.push({ g4: prof.g4_ref.id, season, error: e.message, reason: e.details?.reason ?? e.reason }); continue; }
    for (const l of sel.layers) {
      const desc = prow.payload.layers.find((d) => d.layer === l.layer);
      const phrases = desc?.member_phrases ?? [];
      const refs = l.member_refs.filter((r) => !r.startsWith('baseline:'));
      totSel += refs.length;
      for (const r of refs) {
        const ph = phrases.filter((p) => p.member_ref === r);
        if (ph.length) { totWith += 1; if (ph.some((p) => p.channel !== desc.channel)) chanMismatch += 1; }
        else { totNo += 1; noPhraseKinds[l.layer] = (noPhraseKinds[l.layer] ?? 0) + 1; }
      }
      out.rows.push({ g4: prof.g4_ref.id, season, layer: l.layer, layer_channel: desc?.channel, selected: l.member_refs.length, nonbaseline: refs.length,
        with_phrase: refs.filter((r) => phrases.some((p) => p.member_ref === r)).length });
    }
    if (out.examples.length < 2 && season === 'summer') {
      const lay = sel.layers.find((l) => { const d = prow.payload.layers.find((x) => x.layer === l.layer);
        return d?.channel === 'visual' && l.member_refs.some((r) => !r.startsWith('baseline:') && (d.member_phrases ?? []).some((p) => p.member_ref === r)); });
      if (lay) { const d = prow.payload.layers.find((x) => x.layer === lay.layer);
        out.examples.push({ g4: prof.g4_ref.id, season, layer: lay.layer, clear_text: d.clear_text, partial_text: d.partial_text ?? null,
          member_refs: lay.member_refs, phrases: (d.member_phrases ?? []).filter((p) => lay.member_refs.includes(p.member_ref)).map((p) => ({ member_ref: p.member_ref, channel: p.channel, clear_text: p.clear_text, admission: p.admission })) }); }
    }
  }
}
const cand = JSON.parse(naturalBytes);
const kindOf = new Map();
for (const np of cand.natural_profiles) for (const [lname, layer] of Object.entries(np.natural_profile?.layer_applicability ?? {})) for (const a of layer.alternatives ?? []) kindOf.set(a.id, a.kind);
const noPhraseKind = {};
out.scenes = [];
for (const g4 of ['g4v3__gn_nov_g3_xp017_yp026_r2_central_current_split']) {
  const nrow = naturalRecords.find((r) => r.payload.g4_ref.id === g4); const prow = presRecords.find((r) => r.payload.natural_profile_ref.id === nrow.payload.profile_id);
  for (const season of seasons) {
    const sel = selectG4NaturalMembers({ profile: nrow.payload, frequency_weight_policy: nrow.payload.natural_profile.frequency_weight_policy, party_id: 'party:probe', g5_site_id: 'g5:probe', season, eligible_member_refs: [] });
    const before = []; const after = [];
    for (const d of prow.payload.layers) {
      if (d.channel === 'none') continue;
      const l = sel.layers.find((x) => x.layer === d.layer);
      before.push(`${d.layer}[${d.channel}]: ${d.clear_text}`);
      for (const p of (d.member_phrases ?? [])) if (l?.member_refs.includes(p.member_ref)) after.push(`${d.layer}[${p.channel}]: ${p.clear_text}`);
    }
    out.scenes.push({ g4, season, before, added: after, selection_digest: sel.selection_digest.slice(0, 12) });
  }
}
for (const row of out.rows) { /* kind lookup for unphrased */ }
for (const nrow of naturalRecords) { const prow = presRecords.find((r) => r.payload.natural_profile_ref.id === nrow.payload.profile_id);
  for (const season of seasons) { const sel = selectG4NaturalMembers({ profile: nrow.payload, frequency_weight_policy: nrow.payload.natural_profile.frequency_weight_policy, party_id: 'party:probe', g5_site_id: 'g5:probe', season, eligible_member_refs: [] });
    for (const l of sel.layers) { const d = prow.payload.layers.find((x) => x.layer === l.layer);
      for (const r of l.member_refs.filter((x) => !x.startsWith('baseline:'))) if (!(d.member_phrases ?? []).some((p) => p.member_ref === r)) noPhraseKind[kindOf.get(r) ?? 'unknown'] = (noPhraseKind[kindOf.get(r) ?? 'unknown'] ?? 0) + 1; } } }
out.no_phrase_kinds = noPhraseKind;
out.totals = { selected_nonbaseline: totSel, with_phrase: totWith, without_phrase: totNo, channel_mismatch: chanMismatch, without_by_layer: noPhraseKinds };
writeFileSync('/srv/novgorod-work/demo/etalons/member-phrases-703-r4/probe-d60f645eb.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ natural: out.natural, presentation: out.presentation, errors: out.rows.filter((r) => r.error).length, totals: out.totals, examples: out.examples.length }));
