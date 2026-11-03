#!/usr/bin/env python3
"""Вырезает фикстуры разговора NPC из REC и SC без подмены исходного ввода."""

from __future__ import annotations

import argparse
import copy
import csv
from fractions import Fraction
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


SCHEMA_SCENES = "npc_talk_fixtures_v1"
SCHEMA_OVERFLOW = "npc_talk_overflow_v1"
P3_SCHEMA = "p3_native_observation_v1"
NPC_REQUEST_SCHEMA = "npc_conversation_response_request_v1"
HISTORY_LIMIT = 5000
HISTORY_FIRST_LINE = 19
ACTOR_AVATAR = "avatar"
CASE_IDS = [*(f"A{i}" for i in range(1, 9)), *(f"B{i}" for i in range(1, 9)),
            *(f"V{i}" for i in range(1, 8))]
OVERFLOW_PREFIX_IDS = [*(f"B{i}" for i in range(1, 8))]
OVERFLOW_SUFFIX_IDS = [*(f"A{i}" for i in range(1, 9))]


class FixtureError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise FixtureError(message)


def read_jsonl(path: Path) -> list[tuple[int, dict[str, Any]]]:
    rows: list[tuple[int, dict[str, Any]]] = []
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise FixtureError(f"{path.name}:{line_number}: invalid JSON: {error}") from error
            require(isinstance(value, dict), f"{path.name}:{line_number}: expected a JSON object")
            rows.append((line_number, value))
    return rows


def load_turns(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))
    require(rows and all(row.get("phrase_id") for row in rows),
            f"{path}: missing phrase_id column or rows")
    actual_ids = [row["phrase_id"] for row in rows]
    require(actual_ids == CASE_IDS,
            f"{path}: expected the 23 ordered SC ids {CASE_IDS}, got {actual_ids}")
    return rows


def native_input_turn(row: dict[str, Any], case_id: str) -> int:
    ack = row.get("perception_ack")
    require(isinstance(ack, list) and len(ack) == 3,
            f"{case_id}: inputs.log perception_ack is missing or malformed")
    require(all(isinstance(value, int) and not isinstance(value, bool) for value in ack),
            f"{case_id}: inputs.log perception_ack must contain three integers")
    require(row.get("number") == ack[0],
            f"{case_id}: inputs.log number does not match perception_ack[0]")
    return ack[2]


def input_rows_by_case(path: Path, turns: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    rows = read_jsonl(path)
    result: dict[str, dict[str, Any]] = {}
    for turn in turns:
        case_id = turn["phrase_id"]
        matches = [(line, row) for line, row in rows
                   if row.get("intent") == case_id and row.get("keys") == turn["phrase_text"]]
        require(len(matches) == 1,
                f"{case_id}: expected one exact inputs.log match for intent/keys, found {len(matches)}")
        line, row = matches[0]
        native_input_turn(row, case_id)
        require(row.get("frame") == f"frames/{int(row['number']):04d}.txt",
                f"{case_id}: inputs.log frame does not match its input number")
        result[case_id] = {**row, "_line": line}
    require(len(result) == len(turns), "inputs.log does not map every SC phrase uniquely")
    return result


def perception_rows_by_case(path: Path, turns: list[dict[str, str]],
                            inputs: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    wanted = {int(row["number"]): case_id for case_id, row in inputs.items()}
    found: dict[str, list[tuple[int, dict[str, Any]]]] = {case_id: [] for case_id in wanted.values()}
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise FixtureError(f"{path.name}:{line_number}: invalid JSON: {error}") from error
            if not isinstance(row, dict):
                continue
            input_number = row.get("input_number")
            case_id = wanted.get(input_number) if isinstance(input_number, int) else None
            if case_id is None or row.get("reason") != "input" or row.get("kind") != "full":
                continue
            found[case_id].append((line_number, row))

    result: dict[str, dict[str, Any]] = {}
    for case_id, rows in found.items():
        require(len(rows) == 1,
                f"{case_id}: expected one full input perception row, found {len(rows)}")
        line, row = rows[0]
        input_row = inputs[case_id]
        ack = input_row["perception_ack"]
        require(row.get("sequence") == ack[1] and row.get("native_turn") == ack[2],
                f"{case_id}: perception sequence/native_turn do not match inputs.log acknowledgement")
        require(isinstance(row.get("frame"), dict), f"{case_id}: perception row has no structured frame")
        result[case_id] = {**row, "_line": line}
    return result


def parse_user_payloads(call: dict[str, Any], line_number: int) -> list[dict[str, Any]]:
    request = call.get("request")
    messages = request.get("messages") if isinstance(request, dict) else None
    if not isinstance(messages, list):
        return []
    payloads: list[dict[str, Any]] = []
    for message in messages:
        if not isinstance(message, dict) or message.get("role") != "user":
            continue
        content = message.get("content")
        if not isinstance(content, str):
            continue
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            payloads.append(payload)
    return payloads


def wire_calls_by_case(path: Path, turns: list[dict[str, str]]) -> dict[str, dict[str, Any]]:
    rows = read_jsonl(path)
    result: dict[str, dict[str, Any]] = {}
    for index, turn in enumerate(turns):
        case_id = turn["phrase_id"]
        lower = int(turn["t_enter"])
        upper = int(turns[index + 1]["t_enter"]) if index + 1 < len(turns) else None
        matches: list[tuple[int, dict[str, Any], list[dict[str, Any]]]] = []
        for line_number, call in rows:
            start = call.get("t_start")
            if not isinstance(start, (int, float)) or isinstance(start, bool):
                raise FixtureError(f"wire/capture.jsonl:{line_number}: t_start is not numeric")
            if start < lower or (upper is not None and start >= upper):
                continue
            matches.append((line_number, call, parse_user_payloads(call, line_number)))
        require(len(matches) == int(turn["wire_rows"]),
                f"{case_id}: wire interval [{lower}, {upper}) has {len(matches)} calls; "
                f"SC declares {turn['wire_rows']}")
        npc_requests: list[tuple[int, dict[str, Any]]] = []
        for line_number, _call, payloads in matches:
            for payload in payloads:
                reasons = payload.get("decision_reasons")
                changes = reasons.get("perceived_changes") if isinstance(reasons, dict) else None
                if (payload.get("schema") == NPC_REQUEST_SCHEMA
                        and changes == [turn["phrase_text"]]):
                    npc_requests.append((line_number, payload))
        if case_id == "A2":
            require(not npc_requests, "A2: REC unexpectedly contains a conversation request")
        else:
            require(len(npc_requests) == 1,
                    f"{case_id}: expected one NPC conversation request in its wire interval, "
                    f"found {len(npc_requests)}")
        result[case_id] = {
            "calls": matches,
            "npc_line": npc_requests[0][0] if npc_requests else None,
            "wire_raw": npc_requests[0][1] if npc_requests else None,
        }
    return result


def npc_id_from_payload(payload: dict[str, Any], case_id: str) -> str:
    ref = payload.get("npc_ref")
    require(isinstance(ref, dict) and ref.get("entity_kind") == "npc",
            f"{case_id}: wire npc_ref is missing or malformed")
    npc_id = ref.get("entity_id")
    require(isinstance(npc_id, str) and npc_id.isdigit(), f"{case_id}: invalid wire NPC id")
    return npc_id


def operation_id_from_payload(payload: dict[str, Any], case_id: str, npc_id: str) -> str:
    perceived = payload.get("perceived_message")
    statement = perceived.get("source_statement_ref") if isinstance(perceived, dict) else None
    statement_id = statement.get("entity_id") if isinstance(statement, dict) else None
    match = re.fullmatch(r"p3-player-speech-(.+)", statement_id or "")
    require(match is not None, f"{case_id}: wire source statement has no operation id")
    operation_id = match.group(1)
    perception_ref = perceived.get("perception_result_ref")
    expected = f"p3-heard-{operation_id}-{npc_id}"
    require(isinstance(perception_ref, dict) and perception_ref.get("entity_id") == expected,
            f"{case_id}: wire perceived message does not match its operation/NPC id")
    return operation_id


def wire_observation_turn(payload: dict[str, Any], case_id: str) -> int:
    memory = payload.get("memory")
    observations = memory.get("current_observations") if isinstance(memory, dict) else None
    require(isinstance(observations, list) and observations,
            f"{case_id}: wire memory has no current observations")
    turns: set[int] = set()
    for observation in observations:
        at = observation.get("observed_at") if isinstance(observation, dict) else None
        require(isinstance(at, dict), f"{case_id}: current observation has no observed_at")
        try:
            minutes = int(at["whole_minutes"])
            numerator = int(at["subminute_numerator"])
            denominator = int(at["subminute_denominator"])
        except (KeyError, TypeError, ValueError) as error:
            raise FixtureError(f"{case_id}: invalid wire observed_at: {at}") from error
        require(denominator > 0, f"{case_id}: wire observed_at denominator must be positive")
        total = Fraction(minutes * 60, 1) + Fraction(numerator * 60, denominator)
        require(total.denominator == 1 and total >= 0,
                f"{case_id}: wire observed_at does not resolve to a native turn: {at}")
        turns.add(total.numerator)
    require(len(turns) == 1,
            f"{case_id}: current observations disagree on their P3 turn: {sorted(turns)}")
    return next(iter(turns))


def reply_text_from_sc(value: str, case_id: str) -> str | None:
    if not value:
        return None
    require("«" in value and value.endswith("»"), f"{case_id}: malformed SC reply_text")
    reply = value[value.index("«") + 1:-1]
    require(bool(reply), f"{case_id}: empty quoted SC reply_text")
    return reply


def optional_int(value: str | None) -> int | None:
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except ValueError as error:
        raise FixtureError(f"invalid numeric SC field: {value!r}") from error


def build_case_shells(turns: list[dict[str, str]], inputs: dict[str, dict[str, Any]],
                      perceptions: dict[str, dict[str, Any]],
                      wire: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    cases: dict[str, dict[str, Any]] = {}
    for row_number, turn in enumerate(turns, 2):
        case_id = turn["phrase_id"]
        input_row = inputs[case_id]
        native_turn = native_input_turn(input_row, case_id)
        call_rows = wire[case_id]["calls"]
        npc_line = wire[case_id]["npc_line"]
        payload = wire[case_id]["wire_raw"]
        if payload is not None:
            npc_id = npc_id_from_payload(payload, case_id)
            operation_id = operation_id_from_payload(payload, case_id, npc_id)
            frame_turn = wire_observation_turn(payload, case_id)
            target_ref = f"npc:{npc_id}"
        else:
            npc_id = None
            operation_id = None
            frame_turn = None
            target_ref = None
        cases[case_id] = {
            "id": case_id,
            "scene": turn["scene"],
            "utterance": turn["phrase_text"],
            "npcActorId": npc_id,
            "targetActorRef": target_ref,
            "wireRaw": payload,
            "operationId": operation_id,
            "wireFrameTurn": frame_turn,
            "input": input_row,
            "perception": perceptions[case_id],
            "turn": turn,
            "scLine": row_number,
            "wireCalls": call_rows,
            "npcWireLine": npc_line,
            "inputNativeTurn": native_turn,
            "expectedReply": reply_text_from_sc(turn.get("reply_text", ""), case_id),
        }

    # У A2 нет NPC wire-вызова; адресат установлен по соседним записанным вызовам A1 и A3.
    neighbours = [cases[case_id]["npcActorId"] for case_id in ("A1", "A3")]
    require(neighbours[0] == neighbours[1], "A2 target inference disagrees between A1 and A3")
    cases["A2"]["npcActorId"] = neighbours[0]
    cases["A2"]["targetActorRef"] = f"npc:{neighbours[0]}"
    return cases


def projection_for(frame: dict[str, Any], npc_id: str, case_id: str) -> dict[str, Any]:
    matches = matching_projections(frame, npc_id)
    require(len(matches) == 1,
            f"{case_id}: expected one P3 projection for NPC {npc_id}, found {len(matches)}")
    require(isinstance(matches[0].get("conversation_memory"), list),
            f"{case_id}: NPC projection has no conversation_memory list")
    return matches[0]


def matching_projections(frame: dict[str, Any], npc_id: str) -> list[dict[str, Any]]:
    projections = frame.get("npc_projections")
    if not isinstance(projections, list):
        return []
    return [row for row in projections if isinstance(row, dict) and row.get("actor_id") == npc_id]


def has_heard(record: dict[str, Any], npc_id: str, utterance: str,
              first_turn: int, last_turn: int) -> bool:
    return (record.get("kind") == "heard" and record.get("speaker_ref") == ACTOR_AVATAR
            and record.get("listener_ref") == f"npc:{npc_id}"
            and record.get("text") == utterance
            and isinstance(record.get("turn"), int) and first_turn <= record["turn"] <= last_turn)


def exchange_after(memory: list[dict[str, Any]], heard_index: int, npc_id: str) -> tuple[int | None, str | None]:
    heard_turn = memory[heard_index]["turn"]
    for index in range(heard_index + 1, len(memory)):
        record = memory[index]
        if (record.get("kind") == "heard" and record.get("speaker_ref") == ACTOR_AVATAR
                and record.get("listener_ref") == f"npc:{npc_id}"):
            break
        if (record.get("kind") == "said" and record.get("speaker_ref") == f"npc:{npc_id}"
                and record.get("listener_ref") == ACTOR_AVATAR and record.get("turn", -1) > heard_turn):
            return index, record.get("text")
        if (record.get("kind") == "silence" and record.get("speaker_ref") == f"npc:{npc_id}"
                and record.get("listener_ref") == ACTOR_AVATAR):
            return index, None
    return None, None


def find_current_heard(memory: list[dict[str, Any]], case: dict[str, Any]) -> int:
    low = case["inputNativeTurn"]
    high = case["wireFrameTurn"]
    matches = [index for index, record in enumerate(memory)
               if has_heard(record, case["npcActorId"], case["utterance"], low, high)]
    require(len(matches) == 1,
            f"{case['id']}: expected one heard record in native-turn window [{low}, {high}], "
            f"found {len(matches)}")
    return matches[0]


def make_reconstructed_readback(case: dict[str, Any], heard: dict[str, Any], frame: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    heard_turn = heard["turn"]
    input_turn = case["inputNativeTurn"]
    frame_turn = frame.get("turn")
    require(isinstance(frame_turn, int) and input_turn <= heard_turn <= frame_turn,
            f"{case['id']}: input/heard/frame turns are not monotonic")
    turns = list(dict.fromkeys((input_turn, heard_turn, frame_turn)))
    reconstruction_source = {
        "reconstructed": True,
        "method": "REC inputs.log acknowledgement plus the matching append-only heard event and P3 observation",
        "input_native_turn": input_turn,
        "heard_turn": heard_turn,
        "observation_turn": frame_turn,
    }
    current_turns = {"turns": turns, **reconstruction_source}
    readback = {
        "status": "applied",
        "operation_id": case["operationId"],
        "native_effect": {
            "utterance": case["utterance"],
            "actualHeardListenerIds": [case["npcActorId"]],
        },
        "before": {"turn": input_turn},
        "after": {"turn": heard_turn},
        "source": reconstruction_source,
    }
    return readback, current_turns


def event_source_id(record: dict[str, Any], npc_id: str,
                    cases: dict[str, dict[str, Any]]) -> str:
    candidates = []
    for case_id, case in cases.items():
        if case["npcActorId"] != npc_id or case["utterance"] != record.get("text"):
            continue
        turn = record.get("turn")
        high = case["wireFrameTurn"] if case["wireFrameTurn"] is not None else case["inputNativeTurn"]
        if isinstance(turn, int) and case["inputNativeTurn"] <= turn <= high:
            candidates.append((turn - case["inputNativeTurn"], case_id))
    if candidates:
        candidates.sort()
        return candidates[0][1]
    turn = record.get("turn")
    return f"turn:{turn}" if isinstance(turn, int) else "unknown"


def expected_exchanges(memory: list[dict[str, Any]], npc_id: str,
                       cases: dict[str, dict[str, Any]],
                       skip_heard: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    exchanges: list[dict[str, Any]] = []
    pending: dict[str, Any] | None = None
    skip_key = None
    if skip_heard is not None:
        skip_key = (skip_heard.get("turn"), skip_heard.get("text"),
                    skip_heard.get("speaker_ref"), skip_heard.get("listener_ref"))

    def append_pending() -> None:
        nonlocal pending
        if pending is not None:
            exchanges.append({"id": pending["id"], "playerText": pending["playerText"],
                              "npcText": pending["npcText"]})
            pending = None

    for record in memory:
        if not isinstance(record, dict):
            continue
        if (record.get("kind") == "heard" and record.get("speaker_ref") == ACTOR_AVATAR
                and record.get("listener_ref") == f"npc:{npc_id}"):
            append_pending()
            key = (record.get("turn"), record.get("text"),
                   record.get("speaker_ref"), record.get("listener_ref"))
            if key == skip_key:
                continue
            pending = {"id": event_source_id(record, npc_id, cases),
                       "playerText": record.get("text"), "npcText": None}
            continue
        if pending is None:
            continue
        if (record.get("kind") == "said" and record.get("speaker_ref") == f"npc:{npc_id}"
                and record.get("listener_ref") == ACTOR_AVATAR):
            pending["npcText"] = record.get("text")
            append_pending()
        elif (record.get("kind") == "silence" and record.get("speaker_ref") == f"npc:{npc_id}"
              and record.get("listener_ref") == ACTOR_AVATAR):
            append_pending()
    append_pending()
    return exchanges


def case_source(case: dict[str, Any], capture_turn: int,
                frame: dict[str, Any], reconstruction: dict[str, Any] | None) -> dict[str, Any]:
    turn = case["turn"]
    input_row = case["input"]
    perception = case["perception"]
    return {
        "scene": {
            "path": "scenes/turns.tsv",
            "line": case["scLine"],
            "phrase_id": case["id"],
            "game_time": turn["game_time"],
            "t_enter": int(turn["t_enter"]),
            "t_native_reply": optional_int(turn.get("t_native_reply")),
        },
        "input": {
            "path": "capture/inputs.log",
            "line": input_row["_line"],
            "number": input_row["number"],
            "intent": input_row["intent"],
            "perception_ack": input_row["perception_ack"],
            "recorded_before_turn": input_row.get("before_turn"),
            "recorded_after_turn": input_row.get("after_turn"),
        },
        "perception": {
            "path": "capture/perception.jsonl",
            "line": perception["_line"],
            "input_number": perception["input_number"],
            "sequence": perception["sequence"],
            "native_turn": perception["native_turn"],
        },
        "native_frame": {
            "path": "capture/turns.jsonl.gz",
            "native_turn": capture_turn,
            "observation_turn": frame["turn"],
            "wire_observation_turn": case["wireFrameTurn"],
            "schema": frame["schema"],
        },
        "wire": {
            "path": "wire/capture.jsonl",
            "lines": [line for line, _call, _payloads in case["wireCalls"]],
            "npc_request_line": case["npcWireLine"],
        },
        "playerReadback": reconstruction,
    }


def select_frame_for_case(row: dict[str, Any], case: dict[str, Any]) -> tuple[dict[str, Any], int, int | None, int | None] | None:
    frame = row.get("observation")
    if not isinstance(frame, dict) or frame.get("schema") != P3_SCHEMA:
        return None
    native_turn = row.get("native_turn")
    if case["id"] == "A2" and native_turn != case["inputNativeTurn"]:
        return None
    if case["id"] != "A2" and frame.get("turn") != case["wireFrameTurn"]:
        return None
    projections = matching_projections(frame, case["npcActorId"])
    if not projections:
        return None
    require(len(projections) == 1,
            f"{case['id']}: duplicate P3 projections for NPC {case['npcActorId']}")
    projection = projections[0]
    require(isinstance(projection.get("conversation_memory"), list),
            f"{case['id']}: NPC projection has no conversation_memory list")
    npc_id = case["npcActorId"]
    memory = projection["conversation_memory"]
    if case["id"] == "A2":
        require(not any(has_heard(record, npc_id, case["utterance"], 0, 2**53)
                        for record in memory),
                "A2: selected native observation unexpectedly contains an A2 heard event")
        require(frame.get("turn") == case["inputNativeTurn"],
                "A2: P3 observation turn does not match the source input turn")
        return frame, native_turn, None, None

    if not isinstance(frame.get("turn"), int):
        return None
    if frame["turn"] < case["inputNativeTurn"]:
        return None
    try:
        heard_index = find_current_heard(memory, case)
    except FixtureError:
        return None
    heard = memory[heard_index]
    said_index, said_text = exchange_after(memory, heard_index, npc_id)
    if case["expectedReply"] is None:
        if said_index is not None:
            return None
    elif said_index is None or said_text != case["expectedReply"]:
        return None
    return frame, native_turn if isinstance(native_turn, int) else frame["turn"], heard_index, said_index


def capture_frames(path: Path, cases: dict[str, dict[str, Any]]) -> None:
    unresolved = set(cases)
    found: dict[str, tuple[dict[str, Any], int, int | None, int | None]] = {}
    max_turn = max(case["wireFrameTurn"] or case["inputNativeTurn"]
                   for case in cases.values()) + 1
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise FixtureError(f"turns.jsonl.gz line {line_number}: invalid JSON: {error}") from error
            if not isinstance(row, dict):
                continue
            native_turn = row.get("native_turn")
            if isinstance(native_turn, int) and native_turn > max_turn and unresolved:
                break
            for case_id in tuple(unresolved):
                try:
                    selected = select_frame_for_case(row, cases[case_id])
                except FixtureError:
                    raise
                if selected is not None:
                    found[case_id] = selected
                    unresolved.remove(case_id)
            if not unresolved:
                break

    missing = sorted(unresolved)
    require(not missing,
            f"turns.jsonl.gz has no recoverable p3_native_observation_v1 frame for: {missing}")
    for case_id, (raw_frame, capture_turn, heard_index, said_index) in found.items():
        case = cases[case_id]
        frame = copy.deepcopy(raw_frame)
        projection = projection_for(frame, case["npcActorId"], case_id)
        memory = projection["conversation_memory"]
        source_memory = copy.deepcopy(memory)
        if case_id == "A3":
            a2 = cases["A2"]
            require(not any(has_heard(record, case["npcActorId"], a2["utterance"],
                                      a2["inputNativeTurn"], case["inputNativeTurn"] + 12)
                            for record in memory),
                    "A3: recorded memory contains an unsupported A2 heard event")
        if case_id != "A2":
            require(heard_index is not None, f"{case_id}: current heard event was not identified")
            heard = memory[heard_index]
            readback, current_turns = make_reconstructed_readback(case, heard, frame)
            if said_index is not None:
                require(said_index == len(memory) - 1,
                        f"{case_id}: current NPC said is not the append-only final memory record")
                del memory[said_index]
            case["playerReadback"] = readback
            case["currentTurns"] = current_turns
            case["reconstruction"] = reconstruction = {
                **readback["source"],
                "current_heard_turn": heard["turn"],
                "removed_current_said": said_index is not None,
            }
            case["expectedExchanges"] = expected_exchanges(
                memory, case["npcActorId"], cases, skip_heard=heard)
        else:
            case["playerReadback"] = None
            case["currentTurns"] = {
                "turns": [], "reconstructed": False,
                "reason": "no source readback; factory-only A2 case",
                "source": {"path": "capture/inputs.log", "line": case["input"]["_line"]},
            }
            case["reconstruction"] = None
            case["expectedExchanges"] = expected_exchanges(memory, case["npcActorId"], cases)
            a3_utterance = cases["A3"]["utterance"]
            require(not any(has_heard(record, case["npcActorId"], a3_utterance,
                                      case["inputNativeTurn"], 2**53)
                            for record in memory),
                    "A2: native frame contains a later A3 heard record")
        case["frame"] = frame
        case["projection"] = projection
        case["sourceMemory"] = source_memory
        case["source"] = case_source(case, capture_turn, frame, case["reconstruction"])


def profile_for(case: dict[str, Any], profiles_dir: Path) -> tuple[dict[str, Any] | None, str | None]:
    template_id = case["projection"].get("template_id")
    if not template_id:
        return None, None
    path = profiles_dir / f"{template_id}.json"
    if not path.is_file():
        return None, None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FixtureError(f"{path.name}: cannot load profile: {error}") from error
    return value, f"tools/cataclysm-prototype/npc-profiles/{path.name}"


NODE_PROJECTOR = r"""
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const input = JSON.parse(readFileSync(0, 'utf8'));
const modulePath = resolve(process.cwd(), 'tools/cataclysm-prototype/p3-npc-subject.js');
const { buildP3NpcConversationSubject, projectP3NpcWire } = await import(pathToFileURL(modulePath));

function diffPaths(left, right, path = '') {
  if (isDeepStrictEqual(left, right)) return [];
  const leftObject = left !== null && typeof left === 'object';
  const rightObject = right !== null && typeof right === 'object';
  if (leftObject && rightObject && Array.isArray(left) === Array.isArray(right)) {
    if (Array.isArray(left)) {
      const out = [];
      if (left.length !== right.length) out.push(`${path || '<root>'}.length`);
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        if (index >= left.length || index >= right.length) out.push(`${path}[${index}]`);
        else out.push(...diffPaths(left[index], right[index], `${path}[${index}]`));
      }
      return out;
    }
    const out = [];
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) out.push(childPath);
      else out.push(...diffPaths(left[key], right[key], childPath));
    }
    return out;
  }
  return [path || '<root>'];
}

const results = [];
const failures = [];
for (const item of input.cases) {
  try {
    const player = item.frame.actors.find(actor => actor.actor_ref === 'avatar');
    if (!player) throw new Error('avatar actor missing from frame');
    const npcRef = { entity_kind: 'npc', entity_id: item.npcActorId };
    const playerRef = { entity_kind: 'player_character', entity_id: player.actor_id };
    const perceived = item.wireRaw.perceived_message?.perception_result_ref;
    if (!perceived) throw new Error('wire perceived_message reference missing');
    const subject = buildP3NpcConversationSubject({
      projection: item.projection,
      profile: item.profile,
      frame: item.frame,
      player,
      npcRef,
      playerRef,
      perceptionRef: perceived,
      utterance: item.utterance,
      currentTurns: new Set(item.currentTurns),
    });
    const actual = projectP3NpcWire(subject);
    const wireSubject = projectP3NpcWire(item.wireRaw);
    const differences = [];
    for (const key of ['npc', 'knowledge', 'memory']) {
      differences.push(...diffPaths(actual[key], wireSubject[key], key));
    }
    if (differences.length) failures.push({ case: item.id, differing_paths: differences });
    results.push({ id: item.id, wireSubject });
  } catch (error) {
    failures.push({ case: item.id, error: String(error?.stack ?? error) });
  }
}
if (failures.length) {
  process.stderr.write(`${JSON.stringify({ gate: 'p3_subject_vs_wire', failures }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify({ summary: `canonical subjects matched ${results.length} wire requests`, cases: results })}\n`);
}
"""


def run_projector_gate(cases: dict[str, dict[str, Any]], profiles_dir: Path,
                       repo_root: Path) -> dict[str, dict[str, Any]]:
    wire_cases = []
    for case_id in CASE_IDS:
        case = cases[case_id]
        if case_id == "A2":
            continue
        profile, profile_source = profile_for(case, profiles_dir)
        case["source"]["profile"] = profile_source
        wire_cases.append({
            "id": case_id,
            "frame": case["frame"],
            "projection": case["projection"],
            "profile": profile,
            "wireRaw": case["wireRaw"],
            "utterance": case["utterance"],
            "npcActorId": case["npcActorId"],
            "currentTurns": case["currentTurns"]["turns"],
        })
    require(len(wire_cases) == 22, f"projector gate expected 22 NPC cases, got {len(wire_cases)}")
    try:
        result = subprocess.run(
            ["node", "--input-type=module", "--eval", NODE_PROJECTOR],
            cwd=repo_root,
            input=json.dumps({"cases": wire_cases}, ensure_ascii=False, allow_nan=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
    except OSError as error:
        raise FixtureError(f"cannot run the required Node projector gate: {error}") from error
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise FixtureError(f"existing buildP3NpcConversationSubject gate failed; no fixtures written:\n{details}")
    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise FixtureError(f"Node projector gate did not return its JSON summary: {error}\n{result.stdout}") from error
    entries = output.get("cases") if isinstance(output, dict) else None
    require(isinstance(entries, list) and len(entries) == 22,
            "Node projector gate summary does not contain all 22 wire subjects")
    result_by_id = {entry.get("id"): entry.get("wireSubject") for entry in entries
                    if isinstance(entry, dict)}
    require(set(result_by_id) == {case_id for case_id in CASE_IDS if case_id != "A2"},
            "Node projector gate returned an incomplete or duplicate case set")
    return result_by_id


def history_line(number: int, exchange: dict[str, Any]) -> str:
    player_text = exchange["playerText"]
    npc_text = exchange["npcText"]
    if npc_text is None:
        return f"{number}. Он сказал тебе: «{player_text}» Ты не ответил."
    return f"{number}. Он сказал тебе: «{player_text}» Ты ответил: «{npc_text}»"


def history_length(exchanges: list[dict[str, Any]]) -> int:
    lines = [history_line(HISTORY_FIRST_LINE + index, exchange)
             for index, exchange in enumerate(exchanges)]
    return len("\n".join(lines))


def overflow_exchanges(cases: dict[str, dict[str, Any]], turns: list[dict[str, str]]) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
    b8_by_id = {exchange["id"]: exchange for exchange in cases["B8"]["expectedExchanges"]}
    required = set(OVERFLOW_PREFIX_IDS + ["A1", *[f"A{i}" for i in range(3, 9)]])
    missing = sorted(required - set(b8_by_id))
    require(not missing, f"B8 native memory is missing required source exchanges: {missing}")
    turns_by_id = {row["phrase_id"]: row for row in turns}
    threshold_exchanges: list[dict[str, Any]] = []
    cycle = 0
    while not threshold_exchanges or history_length(threshold_exchanges) < HISTORY_LIMIT:
        cycle += 1
        for case_id in OVERFLOW_PREFIX_IDS:
            source = b8_by_id[case_id]
            exchange = {"id": case_id, "playerText": source["playerText"],
                        "npcText": source["npcText"], "occurrence": cycle}
            require(exchange["npcText"] is not None,
                    f"overflow {case_id}: cycle source is not a complete exchange")
            require(exchange["playerText"] == turns_by_id[case_id]["phrase_text"],
                    f"overflow {case_id}: native memory text differs from SC")
            require(exchange["npcText"] == reply_text_from_sc(
                turns_by_id[case_id].get("reply_text", ""), case_id),
                f"overflow {case_id}: native memory reply differs from SC")
            threshold_exchanges.append(exchange)
            if history_length(threshold_exchanges) >= HISTORY_LIMIT:
                break
        require(cycle < 1000, "overflow cycle count exceeded the safety bound")

    source_by_id = b8_by_id
    suffix: list[dict[str, Any]] = []
    for case_id in OVERFLOW_SUFFIX_IDS:
        row = turns_by_id[case_id]
        if case_id == "A2":
            # A2 добавляется только в явно заданную overflow-историю; в REC его heard-события нет.
            player_text = cases["A2"]["utterance"]
            require(player_text == row["phrase_text"], "overflow A2: inputs.log and SC text differ")
            exchange = {"id": "A2", "playerText": player_text, "npcText": None,
                        "occurrence": 1}
        else:
            source = source_by_id.get(case_id)
            require(source is not None, f"overflow {case_id}: source exchange missing from B8 memory")
            exchange = {"id": case_id, "playerText": source["playerText"],
                        "npcText": source["npcText"], "occurrence": 1}
            require(exchange["playerText"] == row["phrase_text"],
                    f"overflow {case_id}: native memory text differs from SC")
            require(exchange["npcText"] == reply_text_from_sc(row.get("reply_text", ""), case_id),
                    f"overflow {case_id}: native memory reply differs from SC")
        suffix.append(exchange)
    all_exchanges = threshold_exchanges + suffix
    source_rows = [{"phrase_id": row["phrase_id"], "game_time": row["game_time"],
                    "t_enter": int(row["t_enter"]),
                    "t_native_reply": optional_int(row.get("t_native_reply"))}
                   for row in turns if row["phrase_id"] in set(OVERFLOW_PREFIX_IDS + OVERFLOW_SUFFIX_IDS)]
    return all_exchanges, cycle, source_rows


def overflow_memory(exchanges: list[dict[str, Any]],
                    current_heard: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    npc_id = current_heard["listener_ref"].split(":", 1)[1]
    npc_ref = f"npc:{npc_id}"
    avatar_ref = current_heard["speaker_ref"]
    current_turn = current_heard["turn"]
    record_count = sum(1 + (exchange["npcText"] is not None) for exchange in exchanges)
    next_turn = current_turn - record_count - len(exchanges) - 2
    require(next_turn >= 0, "not enough earlier turn ids for overflow timeline")
    memory: list[dict[str, Any]] = []
    timeline: list[dict[str, Any]] = []
    for exchange in exchanges:
        heard_turn = next_turn
        memory.append({"kind": "heard", "speaker_ref": avatar_ref,
                       "listener_ref": npc_ref, "text": exchange["playerText"],
                       "turn": heard_turn})
        next_turn += 1
        said_turn = None
        if exchange["npcText"] is not None:
            said_turn = next_turn
            memory.append({"kind": "said", "speaker_ref": npc_ref,
                           "listener_ref": avatar_ref, "text": exchange["npcText"],
                           "turn": said_turn})
            next_turn += 1
        timeline.append({"id": exchange["id"], "occurrence": exchange["occurrence"],
                         "heard_turn": heard_turn, "said_turn": said_turn})
    require(not memory or memory[-1]["turn"] < current_turn,
            "overflow timeline does not finish before the current B8 heard event")
    memory.append(copy.deepcopy(current_heard))
    require(all(left["turn"] < right["turn"] for left, right in zip(memory, memory[1:])),
            "overflow memory turns are not strictly increasing")
    return memory, timeline


def make_overflow_case(cases: dict[str, dict[str, Any]], turns: list[dict[str, str]]) -> dict[str, Any]:
    base = cases["B8"]
    frame = copy.deepcopy(base["frame"])
    projection = projection_for(frame, base["npcActorId"], "B8")
    source_memory = base["sourceMemory"]
    current_heard_index = find_current_heard(source_memory, base)
    current_heard = source_memory[current_heard_index]
    exchanges, cycles, source_rows = overflow_exchanges(cases, turns)
    extended_memory, timeline = overflow_memory(exchanges, current_heard)
    projection["conversation_memory"] = extended_memory
    threshold_exchanges = exchanges[:-len(OVERFLOW_SUFFIX_IDS)]
    source_lines_before = history_length(threshold_exchanges)
    previous_history_chars = history_length(threshold_exchanges[:-1])
    boundary_exchange = threshold_exchanges[-1]
    boundary_line = history_line(HISTORY_FIRST_LINE + len(threshold_exchanges) - 1,
                                 boundary_exchange)
    require(previous_history_chars < HISTORY_LIMIT <= source_lines_before,
            "overflow boundary is not the first complete exchange to reach 5000 code points")
    source_lines_after = history_length(exchanges)
    source = copy.deepcopy(base["source"])
    source.update({
        "overflow_scenario": {
            "history_rule": "NT/tools/history_chars.py",
            "threshold_codepoints": HISTORY_LIMIT,
            "threshold_history_codepoints_before_A1_A8": source_lines_before,
            "sourceHistoryChars": source_lines_before,
            "sourceCycleCount": cycles,
            "sourceCycleCountMeaning": "B1-B7 cycles entered; the last sequence ends at the first threshold-crossing complete exchange",
            "thresholdBoundaryExchange": {
                "id": boundary_exchange["id"],
                "occurrence": boundary_exchange["occurrence"],
                "previousHistoryChars": previous_history_chars,
                "exchangeLineChars": len(boundary_line),
                "historyChars": source_lines_before,
            },
            "full_history_codepoints_after_A1_A8": source_lines_after,
            "repeated_B_cycles": cycles,
            "sequence": "B1-B7 full exchanges until the first exchange reaches the threshold, then A1-A8",
            "a2": "overflow-only unanswered input from SC; it is absent from every ordinary recorded P3 frame",
            "source_turns_tsv": "scenes/turns.tsv",
            "source_rows": source_rows,
            "created_timeline": timeline,
            "current_b8_heard_turn": current_heard["turn"],
            "wireSubject": "captured B8 request; retained as source reference, not as the overflow projection output",
        },
        "history_source": {
            "path": "capture/turns.jsonl.gz",
            "source_memory_turns": [record["turn"] for record in source_memory],
            "source_exchange_ids": [exchange["id"] for exchange in base["expectedExchanges"]],
        },
    })
    return {
        "schema": SCHEMA_OVERFLOW,
        "id": "B8-overflow",
        "scene": base["scene"],
        "utterance": base["utterance"],
        "targetActorRef": base["targetActorRef"],
        "npcActorId": base["npcActorId"],
        "frame": frame,
        "projection": projection,
        "currentTurns": copy.deepcopy(base["currentTurns"]),
        "playerReadback": copy.deepcopy(base["playerReadback"]),
        "wireSubject": copy.deepcopy(base["wireSubject"]),
        "expectedExchanges": exchanges,
        "source": source,
    }


def audit_malformed_response(path: Path) -> dict[str, Any]:
    rows = read_jsonl(path)
    require(len(rows) == 1, "--audit-calls must contain exactly the selected B0A JSONL record")
    _line, row = rows[0]
    require(row.get("case") == "A1" and row.get("role") == "audit_after_repair",
            "--audit-calls is not B0A line 10 (A1 audit_after_repair)")
    response = row.get("response")
    require(isinstance(response, str) and response,
            "B0A line 10 has no response string")
    return {"text": response,
            "source": {"path": "B0A/raw/calls.jsonl", "original_line": 10}}


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def write_fixture(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_text(value), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rec", required=True, type=Path,
                        help="REC directory containing capture/ and wire/")
    parser.add_argument("--turns-tsv", required=True, type=Path,
                        help="SC scenes/turns.tsv")
    parser.add_argument("--profiles-dir", required=True, type=Path,
                        help="existing WT npc-profiles directory")
    parser.add_argument("--audit-calls", required=True, type=Path,
                        help="one JSONL record copied from B0A/raw/calls.jsonl line 10")
    parser.add_argument("--output-dir", required=True, type=Path,
                        help="bundle directory; writes scenes.json, overflow.json and profiles/")
    parser.add_argument("--repo-root", required=True, type=Path,
                        help="SWT root used to import the existing Node projector")
    args = parser.parse_args()

    turns = load_turns(args.turns_tsv)
    inputs = input_rows_by_case(args.rec / "capture" / "inputs.log", turns)
    perceptions = perception_rows_by_case(args.rec / "capture" / "perception.jsonl", turns, inputs)
    wire = wire_calls_by_case(args.rec / "wire" / "capture.jsonl", turns)
    cases = build_case_shells(turns, inputs, perceptions, wire)
    capture_frames(args.rec / "capture" / "turns.jsonl.gz", cases)

    wire_subjects = run_projector_gate(cases, args.profiles_dir, args.repo_root)
    for case_id, wire_subject in wire_subjects.items():
        cases[case_id]["wireSubject"] = wire_subject
    cases["A2"]["wireSubject"] = None
    overflow = make_overflow_case(cases, turns)
    for case_id in CASE_IDS:
        case = cases[case_id]
        _profile, profile_source = profile_for(case, args.profiles_dir)
        case["source"]["profile"] = profile_source
        case.pop("wireRaw", None)
        case.pop("operationId", None)
        case.pop("input", None)
        case.pop("perception", None)
        case.pop("turn", None)
        case.pop("scLine", None)
        case.pop("wireCalls", None)
        case.pop("npcWireLine", None)
        case.pop("inputNativeTurn", None)
        case.pop("wireFrameTurn", None)
        case.pop("laterInputs", None)
        case.pop("expectedReply", None)
        case.pop("sourceMemory", None)
        case.pop("reconstruction", None)
        case.pop("profile", None)

    scenes = {
        "schema": SCHEMA_SCENES,
        "cases": [{key: cases[case_id][key] for key in (
            "id", "scene", "utterance", "targetActorRef", "npcActorId", "frame",
            "projection", "currentTurns", "playerReadback", "wireSubject",
            "expectedExchanges", "source")}
            for case_id in CASE_IDS],
        "auditMalformedResponse": audit_malformed_response(args.audit_calls),
    }

    profile_source = args.profiles_dir / "novgorod_dev_master.json"
    require(profile_source.is_file(), f"missing master profile: {profile_source}")
    profile_target = args.output_dir / "profiles" / "novgorod_dev_master.json"
    profile_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(profile_source, profile_target)
    write_fixture(args.output_dir / "scenes.json", scenes)
    write_fixture(args.output_dir / "overflow.json", overflow)
    print(f"fixtures written: cases={len(scenes['cases'])}, npc_subject_gate={len(wire_subjects)}, "
          f"overflow_exchanges={len(overflow['expectedExchanges'])}, "
          f"overflow_cycles={overflow['source']['overflow_scenario']['repeated_B_cycles']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FixtureError as error:
        print(f"fixture extraction blocked: {error}", file=sys.stderr)
        raise SystemExit(1)
