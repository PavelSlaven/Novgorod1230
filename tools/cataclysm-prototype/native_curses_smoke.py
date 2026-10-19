import fcntl, hashlib, json, os, pty, select, struct, subprocess, sys, termios, time
build_root = sys.argv[1]
binary = build_root + '/build-release/src/cataclysm'
data = build_root + '/cataclysm-source/data/'
user, log = sys.argv[2:4]
world = os.listdir(user + '/save')[0]
save_world = user + '/save/' + world
verify_path = user + '/verification.json'
def digest(path):
    with open(path, 'rb') as f: return hashlib.sha256(f.read()).hexdigest()
before = {name: digest(save_world + '/' + name) for name in ('#VW4gVGFwaWE=.sav.zzip', 'dimension_data.gsav', 'novgorod_rng_state')}
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 120, 0, 0))
p = subprocess.Popen([binary, '--datadir', data, '--userdir', user, '--world', world], cwd=build_root + '/cataclysm-source', stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
allout = bytearray()
def wait_for(tokens, timeout, label):
    deadline = time.monotonic() + timeout
    start = len(allout)
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.2)
        if ready:
            try: chunk = os.read(master, 32768)
            except OSError: chunk = b''
            if chunk:
                allout.extend(chunk)
                with open(log, 'ab') as f: f.write(chunk)
        clean = bytes(allout[start:])
        low = clean.lower()
        if b'failed to read from' in low or b'an error has occurred' in low:
            raise RuntimeError('native UI error dialog appeared')
        if any(t.lower() in low for t in tokens):
            print('STATE', label, flush=True); return
        if p.poll() is not None: raise RuntimeError('game exited at ' + label + ': ' + str(p.returncode))
    raise TimeoutError('timed out waiting for state: ' + label)
def key(data, label):
    os.write(master, data); print('INPUT', label, flush=True)
open(log, 'wb').close()
try:
    wait_for([b'language'], 20, 'language chooser')
    key(b'1\n', 'select English')
    wait_for([world.encode('utf8'), b'[MOTD]'], 120, 'main menu')
    key(b'l', 'open Load')
    wait_for([b'Load', world.encode('utf8')], 20, 'load selection')
    key(b'\n', 'load selected world')
    wait_for([b'Wield fists', b'Glendora Coyne', b'Safe'], 180, 'loaded game')
    for k in (b'.', b'.', b'6', b'2', b'.'):
        key(k, 'game action ' + repr(k))
        time.sleep(1)
    key(b'\x1b', 'open game menu')
    time.sleep(2)
    key(b'S', 'save and quit')
    time.sleep(2)
    key(b'Y', 'confirm save and quit')
    wait_for([b'Tip of the day'], 120, 'returned to main menu after save')
    key(b'Q', 'select main menu Quit')
    wait_for([b'Really'], 15, 'main menu quit confirmation')
    key(b'Y', 'confirm application exit')
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline and p.poll() is None:
        ready, _, _ = select.select([master], [], [], 0.2)
        if ready:
            try: chunk = os.read(master, 32768)
            except OSError: chunk = b''
            if chunk:
                allout.extend(chunk)
                with open(log, 'ab') as f: f.write(chunk)
    if p.poll() is None: raise TimeoutError('main menu quit did not exit process')
    if p.returncode != 0: raise RuntimeError('game exited with nonzero status: ' + str(p.returncode))
    after = {name: digest(save_world + '/' + name) for name in before}
    unchanged = [name for name in before if before[name] == after[name]]
    if unchanged: raise RuntimeError('save-and-quit did not update expected save/RNG files: ' + ', '.join(unchanged))
    with open(verify_path, 'w') as f:
        json.dump({'before': before, 'after': after, 'process_exit': p.returncode}, f, indent=2)
    if p.poll() is None: raise RuntimeError('quit confirmation did not exit process')
    print('EXIT', p.returncode, flush=True)
except Exception as e:
    print('FAIL', repr(e), 'process=', p.poll(), flush=True)
    if p.poll() is None: p.terminate()
    raise
finally:
    with open(log, 'ab') as f: f.write(('\nPROCESS_EXIT=' + str(p.poll()) + '\n').encode())
