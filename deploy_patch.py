#!/usr/bin/env python3
"""Patch-deploy for careerglitch.com (Career Glitch Mentor build).

Uploads ONLY the files named on the command line, updates their entries
in deploy-manifest.json (the single manifest, per AGENTS.md), and creates
a production deployment referencing the FULL manifest (previous entries
are reused from the saved manifest, exactly as deploy_full.py does —
reportlab-style byte drift is not an issue here, but manifest discipline
is: only the named files get fresh sha/size).

Usage:
  python3 deploy_patch.py mentor.html api/mentor.js [more files...]

All paths are relative to the site dir. A named file must exist locally.
New files are appended to the manifest; changed files are replaced.
After deployment, verify the frozen door pages' bytes did not change.
"""
import hashlib, json, subprocess, base64, os, sys, time

SITE = '/home/hatch/workspace/careerglitch-site'
BIN = '/opt/hatch/bin/vercel'
PROJECT = 'prj_M2t6GcuwdkwG3uy3ljJQRlP9osf0'


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def upload(entry, blob):
    args = {'contentLength': len(blob), 'xVercelDigest': entry['sha'],
            'requestBody': base64.b64encode(blob).decode()}
    for attempt in range(2):
        try:
            r = subprocess.run([BIN, 'call-tool', '--name', 'upload_file',
                                '--arguments-json', json.dumps(args)],
                               capture_output=True, text=True, timeout=180)
            if r.returncode == 0 and '"ok":true' in r.stdout:
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def main():
    targets = sys.argv[1:]
    if not targets:
        print('usage: deploy_patch.py <file> [more files...]')
        sys.exit(64)
    saved = json.load(open(os.path.join(SITE, 'deploy-manifest.json')))
    man = saved['manifest']
    by_file = {m['file']: m for m in man}

    for rel in targets:
        path = os.path.join(SITE, rel)
        if not os.path.isfile(path):
            print('MISSING local file:', rel)
            sys.exit(1)
        blob = open(path, 'rb').read()
        entry = {'file': rel, 'sha': sha1(blob), 'size': len(blob)}
        if not upload(entry, blob):
            print('UPLOAD FAILED:', rel)
            sys.exit(1)
        by_file[rel] = entry
        print('uploaded', rel, entry['sha'], entry['size'])

    saved['manifest'] = list(by_file.values())
    body = {'name': 'careerglitch', 'project': PROJECT, 'target': 'production',
            'files': saved['manifest'],
            'projectSettings': {'buildCommand': None, 'devCommand': None,
                                'framework': None, 'installCommand': None,
                                'outputDirectory': None, 'rootDirectory': None}}
    r = subprocess.run([BIN, 'call-tool', '--name', 'create_deployment',
                        '--arguments-json', json.dumps({'requestBody': body})],
                       capture_output=True, text=True, timeout=300)
    txt = json.loads(r.stdout)['result']['content'][0]['text']
    d = json.loads(txt)
    if 'error' in d:
        print('DEPLOY ERROR:', txt[:600])
        sys.exit(2)
    dep = d.get('result', {}).get('deployment', {})
    print('deployment:', dep.get('id'), '| state:', dep.get('readyState'),
          '| url:', dep.get('url'))
    saved['deployment'] = dep.get('id')
    json.dump(saved, open(os.path.join(SITE, 'deploy-manifest.json'), 'w'), indent=1)
    print('DONE')


if __name__ == '__main__':
    main()
