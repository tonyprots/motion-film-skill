"""Small HTTP helpers shared by providers: retries on 429/5xx and network blips, never logs headers or keys."""
import json, sys, time, uuid, urllib.error, urllib.request


def multipart(fields, files):
    """multipart/form-data body: fields {name: str}, files {name: (filename, bytes, mime)}."""
    b = uuid.uuid4().hex; out = bytearray()
    for k, v in fields.items():
        out += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (fn, data, mime) in files.items():
        out += f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + b'\r\n'
    out += f'--{b}--\r\n'.encode()
    return bytes(out), f'multipart/form-data; boundary={b}'


def post(url, headers, body=None, form=None, timeout=300, retries=5, name='API', hint=None):
    data, ctype = form if form else (json.dumps(body).encode(), 'application/json')
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers={**headers, 'Content-Type': ctype})
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            msg = e.read()[:500].decode(errors='replace')
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                ra = e.headers.get('Retry-After') if e.headers else None
                time.sleep(float(ra) if ra and ra.replace('.', '', 1).isdigit() else 3 * (attempt + 1)); continue
            extra = hint(e.code) if hint else ''
            sys.exit(f'{name} {e.code}: {msg}{"  (" + extra + ")" if extra else ""}')
        except Exception as e:  # timeouts, DNS, dropped connections
            if attempt < retries - 1: time.sleep(5 * (attempt + 1)); continue
            sys.exit(f'{name} request failed: {e}')


def get(url, headers, timeout=60, name='API'):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout))
    except urllib.error.HTTPError as e:
        sys.exit(f'{name} {e.code}: {e.read()[:300].decode(errors="replace")}')


def sse(resp):
    for line in resp:
        line = line.decode().strip()
        if not line.startswith('data:') or line == 'data: [DONE]': continue
        try: yield json.loads(line[5:])
        except Exception: continue
