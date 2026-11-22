#!/usr/bin/env python3
"""Opt-in local media registry. No network, downloads, global cache, or asset rewriting.
assets.py add assets/image.png [--source URL] [--license SPDX] [--metadata local.json] [--refresh]
assets.py check — missing registry is NOT CHECKED; missing/changed registered files are FAIL.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import uuid

MANIFEST = 'assets/manifest.json'
LOCK = 'assets/.manifest.lock'


def local_path(root, value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError('path must be a non-empty project-relative POSIX path')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or re.match(r'^[A-Za-z]:', value):
        raise ValueError(f'path escapes project: {value}')
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(f'symlink escapes project: {value}')
    return resolved


def fingerprint(path):
    if not path.is_file():
        raise ValueError(f'file is missing or is not a regular file: {path.name}')
    before = path.stat()
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    after = path.stat()
    if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError(f'file changed while hashing: {path.name}')
    return {'sha256': digest.hexdigest(), 'size': after.st_size}


def load_manifest(path):
    if not path.exists():
        return {'version': 1, 'assets': {}}
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('assets'), dict):
        raise ValueError('unsupported or invalid asset manifest')
    for name, revisions in data['assets'].items():
        if not isinstance(name, str) or not isinstance(revisions, list) or not revisions:
            raise ValueError('invalid asset revisions')
        for record in revisions:
            if (not isinstance(record, dict) or not re.fullmatch(r'[0-9a-f]{64}', str(record.get('sha256', '')))
                    or type(record.get('size')) is not int or record['size'] < 0
                    or not isinstance(record.get('license'), str) or not isinstance(record.get('provenance'), dict)):
                raise ValueError(f'invalid asset record: {name}')
    return data


def save_manifest(path, data):
    temporary = path.with_name('.manifest-' + uuid.uuid4().hex + '.writing')
    with temporary.open('x', encoding='utf-8') as output:
        json.dump(data, output, ensure_ascii=False, indent=2)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def metadata_record(root, relative, asset):
    path = local_path(root, relative)
    stamp = fingerprint(path)
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError('metadata must be a JSON object')
    # sfx_fetch.py index.json groups records by sound kind; match only the named file.
    indexed = [record for group in data.values() if isinstance(group, list)
               for record in group if isinstance(record, dict) and isinstance(record.get('file'), str)
               and ('licence' in record or 'license' in record)]
    candidates = [record for record in indexed
                  if local_path(root, (PurePosixPath(relative).parent / record['file']).as_posix()) == local_path(root, asset)]
    if len(candidates) > 1:
        raise ValueError('metadata has more than one record for this asset')
    if indexed and not candidates:
        raise ValueError('metadata index has no record matching this asset path')
    record = candidates[0] if candidates else data
    provenance = {'metadata': {'path': PurePosixPath(relative).as_posix(), **stamp}}
    source = record.get('source') or record.get('url')
    if isinstance(source, str):
        provenance['source'] = source
    # broll.py stores job/model next to its output; no provider lookup is needed.
    for key in ('model', 'job', 'fingerprint'):
        if isinstance(record.get(key), str):
            provenance[key] = record[key]
    license_name = record.get('license') or record.get('licence')
    author = record.get('author')
    return provenance, license_name if isinstance(license_name, str) else None, author if isinstance(author, str) else None


def add(root, args):
    path = local_path(root, args.path)
    manifest = local_path(root, MANIFEST)
    lock = local_path(root, LOCK)
    if path in (manifest, lock):
        raise ValueError('the registry and its lock cannot register themselves')
    relative = PurePosixPath(args.path).as_posix()
    record = {**fingerprint(path), 'license': 'unknown', 'provenance': {}}
    if args.metadata:
        provenance, license_name, author = metadata_record(root, args.metadata, relative)
        record['provenance'] = provenance
        if license_name:
            record['license'] = license_name
        if author:
            record['author'] = author
    if args.source:
        record['provenance']['source'] = args.source
    if args.license:
        record['license'] = args.license
    if args.author:
        record['author'] = args.author
    manifest.parent.mkdir(parents=True, exist_ok=True)
    with lock.open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        data = load_manifest(manifest)
        revisions = data['assets'].get(relative, [])
        if revisions:
            # Unspecified metadata on a refresh keeps the previous provenance, not invented defaults.
            previous = revisions[-1]
            if not args.metadata:
                record['provenance'] = {**previous['provenance'], **record['provenance']}
                if not args.license:
                    record['license'] = previous['license']
                if not args.author and previous.get('author'):
                    record['author'] = previous['author']
            if record == {key: value for key, value in previous.items() if key != 'recorded_at'}:
                return {'status': 'UNCHANGED', 'path': relative, 'revisions': len(revisions)}
            if not args.refresh:
                raise ValueError(f'{relative}: bytes or metadata changed; use --refresh to append a revision')
        record['recorded_at'] = datetime.now(timezone.utc).isoformat()
        data['assets'].setdefault(relative, []).append(record)
        save_manifest(manifest, data)
        return {'status': 'ADDED' if not revisions else 'REFRESHED', 'path': relative,
                'revisions': len(data['assets'][relative]), 'sha256': record['sha256'], 'size': record['size']}


def check(root):
    manifest = local_path(root, MANIFEST)
    if not manifest.exists():
        return {'status': 'NOT CHECKED', 'reason': 'no opt-in assets/manifest.json', 'checks': []}
    data = load_manifest(manifest)
    checks = []
    for name, revisions in data['assets'].items():
        record = revisions[-1]
        try:
            actual = fingerprint(local_path(root, name))
            changed = actual != {key: record[key] for key in ('sha256', 'size')}
            checks.append({'level': 'FAIL' if changed else 'PASS', 'path': name,
                           'reason': 'registered bytes changed' if changed else 'bytes match',
                           'expected': {key: record[key] for key in ('sha256', 'size')}, 'actual': actual})
        except (ValueError, OSError) as error:
            checks.append({'level': 'FAIL', 'path': name, 'reason': str(error)})
        if record['license'].strip().lower() in ('', 'unknown', 'unspecified'):
            checks.append({'level': 'WARN', 'path': name, 'reason': 'license is unknown; inspect the original source'})
    levels = {item['level'] for item in checks}
    status = 'FAIL' if 'FAIL' in levels else 'WARN' if 'WARN' in levels else 'PASS' if checks else 'NOT CHECKED'
    return {'status': status, 'registered': len(data['assets']), 'checks': checks}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    register = commands.add_parser('add', help='register one existing local file')
    register.add_argument('path')
    register.add_argument('--source')
    register.add_argument('--license')
    register.add_argument('--author')
    register.add_argument('--metadata', help='existing capture, SFX or B-roll JSON; never fetched')
    register.add_argument('--refresh', action='store_true', help='append a revision, retaining all previous records')
    commands.add_parser('check', help='check registered bytes; never adds or changes entries')
    args = parser.parse_args(argv)
    root = Path.cwd().resolve()
    result = add(root, args) if args.command == 'add' else check(root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result['status'] == 'FAIL' else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(json.dumps({'status': 'FAIL', 'reason': str(error)}, ensure_ascii=False))
        sys.exit(1)
