import hashlib, json, subprocess, base64, os, sys, time
SITE = '/home/hatch/workspace/careerglitch-site'
BIN = '/opt/hatch/bin/vercel'
LOG = open(os.path.join(SITE, 'deploy-log.txt'), 'w')
def log(*a):
    print(*a); print(*a, file=LOG); LOG.flush()
def sha1(b): return hashlib.sha1(b).hexdigest()
saved = json.load(open(os.path.join(SITE, 'deploy-manifest.json')))
man = saved['manifest']
fails = []
for i, m in enumerate(man):
    b = open(os.path.join(SITE, m['file']), 'rb').read()
    assert sha1(b) == m['sha'], m['file']
    args = {'contentLength': len(b), 'xVercelDigest': m['sha'], 'requestBody': base64.b64encode(b).decode()}
    ok = False
    for attempt in range(2):
        try:
            r = subprocess.run([BIN, 'call-tool', '--name', 'upload_file', '--arguments-json', json.dumps(args)],
                               capture_output=True, text=True, timeout=180)
            ok = r.returncode == 0 and '"ok":true' in r.stdout
        except Exception as e:
            ok = False
        if ok: break
        time.sleep(2)
    if not ok:
        fails.append(m['file'])
        log('FAIL', m['file'])
    if (i + 1) % 50 == 0:
        log('progress', i + 1, '/', len(man))
log('uploads complete. fails:', fails)
if fails:
    sys.exit(1)
body = {'name': 'careerglitch', 'project': 'prj_M2t6GcuwdkwG3uy3ljJQRlP9osf0', 'target': 'production',
        'files': man,
        'projectSettings': {'buildCommand': None, 'devCommand': None, 'framework': None,
                            'installCommand': None, 'outputDirectory': None, 'rootDirectory': None}}
r = subprocess.run([BIN, 'call-tool', '--name', 'create_deployment', '--arguments-json',
                    json.dumps({'requestBody': body})], capture_output=True, text=True, timeout=300)
txt = json.loads(r.stdout)['result']['content'][0]['text']
d = json.loads(txt)
if 'error' in d:
    log('DEPLOY ERROR:', txt[:400])
    sys.exit(2)
dep = d.get('result', {}).get('deployment', {})
log('deployment:', dep.get('id'), '| state:', dep.get('readyState'))
saved['deployment'] = dep.get('id')
json.dump(saved, open(os.path.join(SITE, 'deploy-manifest.json'), 'w'))
log('DONE')
