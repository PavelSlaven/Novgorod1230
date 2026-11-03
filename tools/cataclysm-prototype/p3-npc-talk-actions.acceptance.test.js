import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFlowConversationChoices, loadNativeMovementCase, runFlow, runReply } from './npc-talk-test-helpers.js';

const movementLabels = new Set( [ 'подойти', 'отойти' ] );

function npcConversationCase( movement ) {
  const frame = movement.frame;
  const player = frame.actors.find( actor => actor.actor_ref === 'avatar' );
  const actor = frame.actors.find( row => row.actor_ref === movement.actorRef );
  assert.ok( player && actor, `native actors are missing for ${movement.id}` );
  const npcActorId = String( actor.actor_id );
  const utterance = 'Я слышу тебя.';
  return {
    id: movement.id,
    frame,
    targetActorRef: movement.actorRef,
    npcActorId,
    utterance,
    currentTurns: { turns: [ frame.turn ] },
    playerReadback: {
      schema: 'p3_native_operation_readback_v1',
      operation_id: `native-${movement.id}`,
      status: 'applied',
      native_effect: {
        effect_status: 'confirmed',
        primitive: 'speak',
        speakerId: String( player.actor_id ),
        utterance,
        actualHeardListenerIds: [ npcActorId ]
      },
      before: { turn: frame.turn },
      after: { turn: frame.turn }
    }
  };
}

function canonicalRefs( movement ) {
  const player = movement.frame.actors.find( actor => actor.actor_ref === 'avatar' );
  assert.ok( player, `native avatar is missing for ${movement.id}` );
  return {
    npcRef: { entity_kind: 'npc', entity_id: String( movement.npcActorId ) },
    addresseeRef: { entity_kind: 'player_character', entity_id: String( player.actor_id ) }
  };
}

function oracleQueryFor( movement ) {
  const targets = [
    { targetPosition: movement.targetPosition, targetRadius: movement.targetRadius,
      reachable: movement.reachable },
    ...( movement.retreatTargets ?? [] )
  ];
  const calls = [];
  let error = null;
  return {
    calls,
    get error() { return error; },
    queryPath( request ) {
      calls.push( structuredClone( request ) );
      if( JSON.stringify( Object.keys( request ?? {} ).sort() ) !==
          JSON.stringify( [ 'actorRef', 'targetPosition', 'targetRadius' ] ) ) {
        error = new Error( `queryPath request shape mismatch for ${movement.id}` );
        throw error;
      }
      if( request?.actorRef !== movement.actorRef ) {
        error = new Error( `native route actor mismatch for ${movement.id}` );
        throw error;
      }
      const target = targets.find( candidate => candidate.targetRadius === request.targetRadius
        && JSON.stringify( candidate.targetPosition ) === JSON.stringify( request.targetPosition ) );
      if( !target ) {
        error = new Error( `queryPath request has no native oracle row for ${movement.id}` );
        throw error;
      }
      return { reachable: target.reachable };
    }
  };
}

async function buildActions( input ) {
  const runtime = await import( '@rus/npc-runtime' );
  assert.equal( typeof runtime.buildNpcAvailableActions, 'function',
    'npc runtime must export buildNpcAvailableActions' );
  return runtime.buildNpcAvailableActions( input );
}

function movementActions( actions ) {
  return actions.filter( action => movementLabels.has( action.label )
    || action.operation?.op === 'request_movement' );
}

function userPrompts( result ) {
  return result.calls.flatMap( call => call.messages ?? [])
    .filter( message => message.role === 'user' )
    .map( message => message.content )
    .filter( content => typeof content === 'string' )
    .join( '\n' );
}

function assertQueryPathUsed( result, oracle ) {
  assert.equal( oracle.error, null, oracle.error?.message );
  assert.ok( oracle.calls.length > 0, 'P3 must query the native route oracle' );
  assert.ok( result.nativeCalls.some( call => call.method === 'queryPath' ),
    'P3 must call nativeAdapter.queryPath' );
}

test( 'M1 native blocked-near frame offers only speech or silence in reply and flow', async () => {
  const movement = await loadNativeMovementCase( 'movement-blocked-near' );
  const { npcRef, addresseeRef } = canonicalRefs( movement );
  const actions = await buildActions( { npc_ref: npcRef, addressee_ref: addresseeRef,
    operation_contract: { request_movement: {} }, movements: { approach: false, retreat: false } } );
  assert.deepEqual( actions.map( action => action.label ).sort(), [ 'говорить', 'промолчать' ].sort() );
  assert.deepEqual( movementActions( actions ), [] );

  const sceneCase = npcConversationCase( movement );
  const replyOracle = oracleQueryFor( movement );
  const reply = await runReply( sceneCase, { captureOnly: true,
    nativeAdapterOverrides: { queryPath: replyOracle.queryPath } } );
  assertQueryPathUsed( reply, replyOracle );
  const flowOracle = oracleQueryFor( movement );
  const flow = await runFlow( sceneCase, { captureOnly: true,
    nativeAdapterOverrides: { queryPath: flowOracle.queryPath } } );
  assertQueryPathUsed( flow, flowOracle );
  assert.match( userPrompts( reply ), /говорить/u );
  assert.ok( userPrompts( reply ).includes( 'промолчать' ) );
  assert.doesNotMatch( userPrompts( reply ), /подойти|отойти/u );
  const flowCall = flow.calls.find( call => call.role_id === 'npc_autonomous_decider' );
  assert.ok( flowCall, 'autonomous model call must be captured' );
  const flowChoices = assertFlowConversationChoices( flowCall.messages );
  assert.deepEqual( movementActions( flowChoices ), [] );
} );

test( 'M2 native far no-route frame does not offer approach', async () => {
  const movement = await loadNativeMovementCase( 'movement-far-no-route' );
  const sceneCase = npcConversationCase( movement );
  const oracle = oracleQueryFor( movement );
  const reply = await runReply( sceneCase, { captureOnly: true,
    nativeAdapterOverrides: { queryPath: oracle.queryPath } } );
  assertQueryPathUsed( reply, oracle );

  const { npcRef, addresseeRef } = canonicalRefs( movement );
  const actions = await buildActions( { npc_ref: npcRef, addressee_ref: addresseeRef,
    operation_contract: { request_movement: {} }, movements: { approach: false, retreat: false } } );
  assert.deepEqual( movementActions( actions ).filter( action => action.label === 'подойти' ), [] );
  assert.doesNotMatch( userPrompts( reply ), /подойти/u );
} );

test( 'M3 reachable route cannot add movement without request_movement contract', async () => {
  const movement = await loadNativeMovementCase( 'movement-far-reachable' );
  assert.equal( movement.reachable, true, 'native route oracle must report a reachable player' );
  const { npcRef, addresseeRef } = canonicalRefs( movement );
  const frameBefore = JSON.stringify( movement.frame );
  const actions = await buildActions( { npc_ref: npcRef,
    addressee_ref: addresseeRef, operation_contract: {},
    movements: { approach: true, retreat: true } } );
  assert.deepEqual( movementActions( actions ), [] );
  assert.equal( JSON.stringify( movement.frame ), frameBefore,
    'builder must not add route or capability fields to the raw observation' );
} );

test( 'M4 native far route offers an approach operation', async () => {
  const movement = await loadNativeMovementCase( 'movement-far-reachable' );
  assert.equal( movement.reachable, true, 'native route oracle must report a reachable player' );
  const { npcRef, addresseeRef } = canonicalRefs( movement );
  const actions = await buildActions( { npc_ref: npcRef, addressee_ref: addresseeRef,
    operation_contract: { request_movement: {} }, movements: { approach: true, retreat: false } } );
  const approach = movementActions( actions ).find( action => action.label === 'подойти' );
  assert.ok( approach, 'reachable native route must expose approach' );
  assert.equal( approach.operation.op, 'request_movement' );
  assert.deepEqual( approach.operation.actor_ref, npcRef );
  assert.deepEqual( approach.operation.target_ref, addresseeRef );
  assert.equal( approach.operation.movement_intent, 'approach' );

  const sceneCase = npcConversationCase( movement );
  const oracle = oracleQueryFor( movement );
  const reply = await runReply( sceneCase, { captureOnly: true,
    nativeAdapterOverrides: { queryPath: oracle.queryPath } } );
  assertQueryPathUsed( reply, oracle );
  assert.match( userPrompts( reply ), /подойти/u );
} );
