#!/usr/bin/env python3
"""Check named Novgorod SQLite source references against the tracked read-only snapshot."""
import argparse
import csv
import re
import sqlite3
import sys
from pathlib import Path

DATABASE_RELATIVE = Path('sources/bic-reproducible-inputs-v1/data/curated/novgorod_1230_curated.sqlite')
KEY_COLUMNS = {
    'birchbark_selection': 'number', 'city_features': 'id', 'confidence': 'code',
    'economy': 'item', 'ends': 'id', 'events': 'date', 'famine_prices': 'item',
    'institutions': 'id', 'law': 'id', 'material_culture': 'item', 'metadata': 'key',
    'persons_1230': 'id', 'settlements': 'id', 'social_groups': 'group_name',
    'sources': 'id', 'streets': 'id', 'territories': 'id',
}
COLON_REF = re.compile(r'sqlite:novgorod_1230:([a-z_]+):(.+)')
LEGACY_REF = re.compile(r'sqlite:novgorod_1230(?:\([^)]*\))*\.([a-z_]+)\((.*),([A-D])\)')
SOURCE_REF = re.compile(r'sqlite:novgorod_1230\.sources#([^\s,;"\']+)')
NAMED_PREFIX = 'sqlite:novgorod_1230'
CODE_SUFFIXES = {'.cjs', '.js', '.mjs', '.py', '.ts'}


def repository_root():
    script = Path(__file__).resolve()
    for parent in (script.parent, *script.parents):
        if (parent / 'data/world-catalogs/novgorod').is_dir() and (parent / 'package.json').is_file():
            return parent
    raise RuntimeError('cannot locate repository root: expected data/world-catalogs/novgorod and package.json')


def default_database_path():
    script = Path(__file__).resolve()
    for parent in (script.parent, *script.parents):
        candidate = parent / DATABASE_RELATIVE
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f'cannot locate read-only SQLite input {DATABASE_RELATIVE} from {script}')


def open_database(path=None):
    database = Path(path) if path is not None else default_database_path()
    uri = database.resolve().as_uri() + '?mode=ro'
    return sqlite3.connect(uri, uri=True)


def quoted_value_end(line, target):
    quote = None
    opening = None
    target_inside = False
    index = 0
    while index < len(line):
        char = line[index]
        if quote is not None and index == target:
            target_inside = True
        if quote is not None and char == '\\':
            index += 2
            continue
        if char == quote:
            if quote == '"' and index + 1 < len(line) and line[index + 1] == '"':
                index += 2
                continue
            if target_inside:
                return index
            quote = None
            opening = None
            target_inside = False
        elif quote is None and char in ('"', "'", '`'):
            previous = line[index - 1] if index else ''
            if (char == '"' or not previous or previous.isspace() or
                    previous in "([{=:,"):
                quote = char
                opening = index
        index += 1
    return None if target_inside else False


def parse_reference(reference):
    match = COLON_REF.fullmatch(reference)
    if match:
        return match[1], match[2], None
    match = LEGACY_REF.fullmatch(reference)
    if match:
        return match[1], match[2], match[3]
    match = SOURCE_REF.fullmatch(reference)
    if match:
        return 'sources', match[1], None
    return None


def reference_error(connection, reference):
    parsed = parse_reference(reference)
    if parsed is None:
        return f'malformed or unsupported SQLite reference: {reference}'
    table, key, expected_confidence = parsed
    if not key:
        return f'missing SQLite key: {reference}'
    column = KEY_COLUMNS.get(table)
    if column is None:
        return f'unknown SQLite table: {table}'
    try:
        rows = connection.execute(
            f'SELECT * FROM "{table}" WHERE "{column}" = ?', (key,)
        ).fetchall()
    except sqlite3.Error as error:
        return f'cannot query SQLite reference {reference}: {error}'
    if not rows:
        return f'SQLite key not found (exact match required): {reference}'
    if len(rows) != 1:
        return f'ambiguous SQLite key ({len(rows)} rows): {reference}'
    if expected_confidence:
        columns = [item[1] for item in connection.execute(f'PRAGMA table_info("{table}")')]
        if 'confidence' not in columns or rows[0][columns.index('confidence')] != expected_confidence:
            return f'SQLite confidence differs from reference: {reference}'
    return None


def source_references(root):
    root = Path(root)
    if not root.is_dir():
        raise RuntimeError(f'data directory not found for SQLite reference scan: {root}')
    refs = []
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.suffix.lower() in {'.sqlite', '.db'}:
            continue
        if '.test.' in path.name or path.name == Path(__file__).name:
            continue
        try:
            if path.suffix.lower() == '.csv':
                with path.open(encoding='utf-8-sig', newline='') as source:
                    reader = csv.reader(source, strict=True)
                    lines = [(reader.line_num, value) for row in reader for value in row]
            else:
                text = path.read_text(encoding='utf-8-sig')
                lines = [(number, line) for number, line in enumerate(text.splitlines(), 1)]
        except (OSError, UnicodeError, csv.Error) as error:
            if isinstance(error, csv.Error):
                raise ValueError(f'malformed CSV while scanning SQLite references: {path}: {error}') from error
            continue
        for line_number, line in lines:
            for match in re.finditer(re.escape(NAMED_PREFIX), line):
                suffix = line[match.end():]
                if suffix.startswith(':'):
                    tail = suffix[1:]
                    table_match = re.match(r'([a-z_]+):', tail)
                    if table_match:
                        key_start = table_match.end()
                        value_start = match.end() + 1 + key_start
                        quote_end = quoted_value_end(line, match.start())
                        if quote_end is None:
                            raise ValueError(
                                f'unclosed quoted SQLite reference: {path}:{line_number}: {line[match.start():]}'
                            )
                        if quote_end is not False:
                            key = line[value_start:quote_end]
                        else:
                            remainder = line[value_start:]
                            if path.suffix.lower() != '.csv' and re.search(r'[,"\'`;\]}]', remainder):
                                raise ValueError(
                                    f'unquoted ambiguous SQLite reference boundary: {path}:{line_number}: '
                                    f'{line[match.start():]}'
                                )
                            key = remainder.strip()
                        reference = NAMED_PREFIX + ':' + tail[:key_start] + key
                        refs.append((str(path), line_number, reference))
                    else:
                        refs.append((str(path), line_number, NAMED_PREFIX + suffix.split()[0]))
                elif suffix.startswith('('):
                    legacy = re.match(r'(?:\([^)]*\))*\.([a-z_]+)\(([^)]*)\)', suffix)
                    if legacy:
                        reference = NAMED_PREFIX + suffix[:legacy.end()]
                        if not (path.suffix.lower() in CODE_SUFFIXES and
                                ('${' in reference or re.search(r'\{[A-Za-z_]\w*\}', reference))):
                            refs.append((str(path), line_number, reference))
                    else:
                        # Builder constants may hold only the legacy namespace/table
                        # prefix; that fragment is not a source reference by itself.
                        if (path.suffix.lower() in CODE_SUFFIXES and
                                re.fullmatch(r'(?:\([^)]*\))*\.[a-z_]+', suffix.split(';', 1)[0].rstrip('"\'`'))):
                            continue
                        token = re.split(r'["\',;\]}\s]', suffix, maxsplit=1)[0]
                        refs.append((str(path), line_number, NAMED_PREFIX + token))
                elif suffix.startswith('.sources#'):
                    source = SOURCE_REF.match(line, match.start())
                    if source:
                        reference = source[0].rstrip('`')
                        if not (path.suffix.lower() in CODE_SUFFIXES and
                                ('${' in reference or re.search(r'\{[A-Za-z_]\w*\}', reference))):
                            refs.append((str(path), line_number, reference))
                    else:
                        token = re.split(r'["\',;\]}\s]', suffix, maxsplit=1)[0]
                        refs.append((str(path), line_number, NAMED_PREFIX + token))
                elif suffix.startswith('.'):
                    token = re.split(r'["\',;\]}\s]', suffix, maxsplit=1)[0]
                    refs.append((str(path), line_number, NAMED_PREFIX + token))
                elif not suffix or suffix[0] in '"\'`;)]}':
                    if path.suffix.lower() not in CODE_SUFFIXES:
                        refs.append((str(path), line_number, NAMED_PREFIX))
    return refs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', help='SQLite file (opened read-only)')
    parser.add_argument('--ref', action='append', help='reference to check; repeatable')
    args = parser.parse_args(argv)
    try:
        refs = ([(None, None, ref) for ref in args.ref] if args.ref else
                source_references(repository_root() / 'data'))
        connection = open_database(args.db)
    except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
        print(f'FAIL SQLite source or scan unavailable: {error}')
        print('RESULT FAIL 1')
        return 1
    failures = []
    with connection:
        seen = set()
        for file, line, ref in refs:
            key = (file, line, ref)
            if key in seen:
                continue
            seen.add(key)
            error = reference_error(connection, ref)
            if error:
                location = f'{file}:{line}: ' if file else ''
                failures.append(location + error)
        print(f'refs checked {len(seen)}')
    for failure in failures:
        print('FAIL', failure)
    print(f'RESULT {"FAIL" if failures else "PASS"} {len(failures)}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
