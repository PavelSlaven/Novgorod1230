import { mergeActionProducedPhysicalFacts } from '@rus/items-property';

export function deriveActionProducedSourceUpdates(proposal, sourcePins) {
  return proposal.source_transitions.flatMap((transition) => {
    const pin = sourcePins.find(({ item_id: id }) => id === transition.entity_ref);
    const primaryRef = proposal.source_transitions[0].entity_ref;
    const retireSource = transition.finite_resource_transition === null
      && transition.after.mechanics_snapshot === null
      && (proposal.identity_mode === 'independent_outputs'
        || proposal.identity_mode === 'preserve_source'
          && transition.entity_ref !== primaryRef);
    const changed = transition.finite_resource_transition !== null
      || transition.after.mechanics_snapshot !== null || retireSource;
    if (!changed) return [];
    const preservedResult = proposal.identity_mode === 'preserve_source'
      && transition.entity_ref === proposal.results[0].entity_ref
      ? proposal.results[0] : null;
    const survivingPartition = proposal.identity_mode === 'independent_outputs'
      && proposal.result_class === 'partial_transformation'
      && transition.after.mechanics_snapshot !== null && !retireSource
      && transition.finite_resource_transition?.lifecycle_state_after !== 'depleted';
    const descriptor = proposal.qualitative_result.result_descriptor;
    const sourceDelta = survivingPartition ? descriptor.source_fact_delta : null;
    const physicalState = preservedResult === null && !survivingPartition ? null
      : mergeActionProducedPhysicalFacts({
        entity_ref: pin.item_id,
        action_ref: proposal.causal_identity.action_ref,
        existing: pin.item.state?.ordinary_metadata?.semantic_facts ?? [],
        existing_inscriptions:
          pin.item.state?.ordinary_metadata?.physical_inscriptions ?? [],
        physical_description: sourceDelta === null
          ? descriptor.physical_description : sourceDelta.physical_description,
        physical_facts: sourceDelta === null
          ? preservedResult?.physical_facts ?? descriptor.qualitative_facts
          : sourceDelta.qualitative_facts,
        removed_fact_refs: sourceDelta === null
          ? descriptor.removed_physical_fact_refs ?? []
          : sourceDelta.removed_physical_fact_refs,
        inscription_text: preservedResult?.inscription_text ?? null
      });
    const nextState = {
      ...(pin.item.state ?? {}),
      lifecycle_status: retireSource || transition.finite_resource_transition
        ?.lifecycle_state_after === 'depleted' ? 'retired' : 'active',
      ...(transition.after.mechanics_snapshot === null ? {} : {
        runtime_instance_mechanics_snapshot:
          structuredClone(transition.after.mechanics_snapshot)
      }),
      ...(physicalState === null ? {} : {
        ordinary_metadata: {
          ...(pin.item.state?.ordinary_metadata ?? {}),
          semantic_facts: structuredClone(physicalState.physical_facts),
          physical_inscriptions: structuredClone(physicalState.physical_inscriptions)
        },
        ...(preservedResult === null && !survivingPartition ? {} : {
          action_production: {
            schema: 'rus.items.action_production_item_state.v1',
            causal_identity: structuredClone(proposal.causal_identity),
            result_class: proposal.result_class,
            output_class: proposal.qualitative_result.output_class,
            physical_form: survivingPartition ? sourceDelta.physical_form
              : descriptor.physical_form
          }
        })
      })
    };
    return [{
      item_id: pin.item_id,
      expected_item_state_version: pin.item.state_version,
      before_item: structuredClone(pin.item),
      after_item: {
        ...pin.item,
        ...(transition.after.mechanics_snapshot === null ? {} : {
          run_id: null, template_id: null, profile_id: null, category_id: null
        }),
        ...(retireSource ? { condition_state: 'retired' } : {}),
        state: nextState,
        state_version: pin.item.state_version + 1
      },
      finite_resource_transition:
        structuredClone(transition.finite_resource_transition)
    }];
  });
}
