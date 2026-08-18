import { resolveFiniteSourceInitialAmount } from
  '@rus/items-property/finite-resource-transition';

// Generic finite-source effect owner. Context-bound and constrained policies
// decide whether a source is admissible; conservation depends only on the
// exact committed finite source and the admitted item's causal basis.
export function finiteSourceTransition({ profile, item,
  request_identity } = {}) {
  const source = finiteSource(profile);
  const quantity = item?.mechanics_snapshot?.mechanics?.quantity;
  if (!source || !text(request_identity)
      || !Array.isArray(item?.causal_basis_refs)
      || !item.causal_basis_refs.includes(source.source_resource_node_id)
      || item.position_ref == null || item.property_basis_ref == null
      || !integer(quantity?.value) || quantity.value < 1
      || quantity.unit !== source.quantity.unit) return null;
  const before = source.quantity;
  if (source.lifecycle_state !== 'active' || before.denominator !== 1
      || before.numerator < quantity.value) return null;
  const after = before.numerator - quantity.value;
  return deepFreeze({ source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version,
    causal_transition_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    before_quantity: structuredClone(before),
    decrement_quantity: { numerator: quantity.value, denominator: 1,
      unit: quantity.unit },
    after_quantity: { numerator: after, denominator: 1, unit: quantity.unit },
    next_state_version: source.state_version + 1,
    lifecycle_state_after: after === 0 ? 'depleted' : 'active' });
}

export function finiteSourceInitialization({ profile, item,
  request_identity, estimated_amount } = {}) {
  const source = finiteSource(profile);
  if (!source || source.lifecycle_state !== 'uninitialized'
      || !rational(estimated_amount) || !Array.isArray(item?.causal_basis_refs)
      || !item.causal_basis_refs.includes(source.source_resource_node_id)) {
    return null;
  }
  let initialized;
  try {
    initialized = resolveFiniteSourceInitialAmount({
      initialization_identity: request_identity, committed_amount: null,
      approved_bounds: structuredClone(source.initial_amount_bounds),
      estimated_amount: structuredClone(estimated_amount)
    });
  } catch { return null; }
  const quantity = item?.mechanics_snapshot?.mechanics?.quantity;
  if (!integer(quantity?.value) || quantity.value < 1
      || quantity.unit !== initialized.amount.unit
      || initialized.amount.denominator !== 1
      || initialized.amount.numerator < quantity.value) return null;
  const after = initialized.amount.numerator - quantity.value;
  const transition = { source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version + 1,
    causal_transition_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    before_quantity: structuredClone(initialized.amount),
    decrement_quantity: { numerator: quantity.value, denominator: 1,
      unit: quantity.unit },
    after_quantity: { numerator: after, denominator: 1,
      unit: quantity.unit }, next_state_version: source.state_version + 2,
    lifecycle_state_after: after === 0 ? 'depleted' : 'active' };
  return deepFreeze({ finite_resource_initialization: {
    source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version,
    initialization_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    estimated_amount: structuredClone(initialized.amount),
    approved_bounds: structuredClone(source.initial_amount_bounds)
  }, finite_resource_transition: transition });
}

export function resolveFiniteSourceAuthority({ authority,
  committed_source } = {}) {
  const value = record(authority, ['schema','version','state',
    'source_basis_ref','finite_source']);
  const pin = value && record(value.finite_source,
    ['source_resource_node_id','quantity_unit_ref','position_ref',
      'property_basis_ref','initial_amount_bounds']);
  const committed = finiteSource({ source_basis_ref: value?.source_basis_ref,
    finite_source: committed_source });
  if (!value || value.schema !== 'rus.items.finite_source_authority.v1'
      || value.version !== 1 || value.state !== 'committed' || !pin || !committed
      || pin.source_resource_node_id !== value.source_basis_ref
      || pin.source_resource_node_id !== committed.source_resource_node_id
      || JSON.stringify(pin.quantity_unit_ref)
        !== JSON.stringify(committed.quantity_unit_ref)
      || pin.position_ref !== committed.position_ref
      || pin.property_basis_ref !== committed.property_basis_ref
      || (committed.lifecycle_state === 'uninitialized'
        && JSON.stringify(pin.initial_amount_bounds)
          !== JSON.stringify(committed.initial_amount_bounds))) return null;
  return deepFreeze({ ...structuredClone(value),
    finite_source: structuredClone(committed) });
}

function finiteSource(profile) {
  if (!plain(profile) || !text(profile.source_basis_ref)) return null;
  const value = profile.finite_source;
  const keys = value?.lifecycle_state === 'uninitialized'
    ? ['source_resource_node_id','state_version','lifecycle_state','quantity',
      'quantity_unit_ref','position_ref','property_basis_ref','initial_amount_bounds']
    : ['source_resource_node_id','state_version','lifecycle_state','quantity',
      'quantity_unit_ref','position_ref','property_basis_ref'];
  if (!record(value, keys) || value.source_resource_node_id !== profile.source_basis_ref
      || !integer(value.state_version) || value.state_version < 1
      || !['active','uninitialized'].includes(value.lifecycle_state)
      || !rational(value.quantity) || !plain(value.quantity_unit_ref)
      || !text(value.quantity_unit_ref.id)
      || value.quantity.unit !== value.quantity_unit_ref.id
      || !text(value.position_ref)
      || !(value.property_basis_ref === null || text(value.property_basis_ref))) {
    return null;
  }
  if (value.lifecycle_state === 'uninitialized'
      && !validBounds(value.initial_amount_bounds, value.quantity.unit)) return null;
  return value;
}
function validBounds(value, unit) { const bounds=record(value,['minimum','maximum']);
  return !!bounds && rational(bounds.minimum) && rational(bounds.maximum)
    && bounds.minimum.numerator>0 && bounds.maximum.numerator>0
    && bounds.minimum.unit===unit && bounds.maximum.unit===unit
    && BigInt(bounds.minimum.numerator)*BigInt(bounds.maximum.denominator)
      <= BigInt(bounds.maximum.numerator)*BigInt(bounds.minimum.denominator); }
function rational(value) { const q=record(value,['numerator','denominator','unit']);
  return q&&integer(q.numerator)&&q.numerator>=0&&integer(q.denominator)
    &&q.denominator>=1&&text(q.unit)&&gcd(q.numerator,q.denominator)===1; }
function gcd(a,b){while(b!==0)[a,b]=[b,a%b];return a||1;}
function record(value,keys){return plain(value)&&Object.keys(value).length===keys.length
  &&keys.every((key)=>Object.hasOwn(value,key))?value:null;}
function plain(value){return value!=null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.getPrototypeOf(value)===Object.prototype;}
function integer(value){return Number.isSafeInteger(value);}
function text(value){return typeof value==='string'&&value.length>0&&value.trim()===value;}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const entry of Object.values(value))deepFreeze(entry);Object.freeze(value);}return value;}
