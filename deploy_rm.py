import hashlib, json, os, subprocess, sys, glob

SITE = '/home/hatch/workspace/careerglitch-site'
BIN = '/opt/hatch/bin/vercel'
CURATED = ['index.html', 'master_prompt.txt', 'avatar.jpg', 'masha.jpg', 'logo.jpg', 'cover-dental.jpg',
           'favicon.ico', 'favicon-32.png', 'favicon-180.png',
           'CareerGlitch_Accountant_Roadmap_2027_v7.pdf', 'Career_Mentor_Master_Prompt.pdf',
           'CareerGlitch_Electrician_Roadmap_2027_v1.pdf', 'CareerGlitch_AIAgentManager_Roadmap_2027_v1.pdf',
           'CareerGlitch_GraphicDesigner_Roadmap_2027_v1.pdf', 'CareerGlitch_JuniorDeveloper_Roadmap_2027_v1.pdf',
           'CareerGlitch_NuclearReactorOperator_Roadmap_2027_v1.pdf',
           'CareerGlitch_InsuranceProducer_Roadmap_2027_v1.pdf', 'CareerGlitch_DentalHygienist_Roadmap_2027_v1.pdf',
           'cat-online.jpg', 'cat-health.jpg', 'cat-trades.jpg', 'cat-creative.jpg', 'cat-beauty.jpg',
           'cat-food.jpg', 'cat-people.jpg', 'cat-transport.jpg', 'cat-business.jpg']
NEW = ['professions.json', 'roadmaps-data-1.json', 'roadmaps-data-2.json']
pdfs = sorted(os.path.basename(p) for p in glob.glob(SITE + '/CareerGlitch_*_Roadmap_2027_v1.pdf'))
ALL = list(dict.fromkeys(CURATED + NEW + pdfs))
UPLOAD = list(dict.fromkeys(['index.html'] + NEW + pdfs))
# the 7 pre-existing v1 PDFs are already on the server from prior deploys; upload only truly new ones
PREV_V1 = {'CareerGlitch_Electrician_Roadmap_2027_v1.pdf', 'CareerGlitch_AIAgentManager_Roadmap_2027_v1.pdf',
           'CareerGlitch_GraphicDesigner_Roadmap_2027_v1.pdf', 'CareerGlitch_JuniorDeveloper_Roadmap_2027_v1.pdf',
           'CareerGlitch_NuclearReactorOperator_Roadmap_2027_v1.pdf',
           'CareerGlitch_InsuranceProducer_Roadmap_2027_v1.pdf', 'CareerGlitch_DentalHygienist_Roadmap_2027_v1.pdf'}
UPLOAD = [f for f in UPLOAD if f not in PREV_V1]

def sha1(b):
    return hashlib.sha1(b).hexdigest()

manifest = []
for f in ALL:
    b = open(os.path.join(SITE, f), 'rb').read()
    manifest.append({'file': f, 'sha': sha1(b), 'size': len(b)})
json.dump(manifest, open('/tmp/cg_manifest.json', 'w'))
print('manifest files:', len(manifest), '| to upload:', len(UPLOAD), flush=True)

import base64
fails = []
for i, f in enumerate(UPLOAD, 1):
    b = open(os.path.join(SITE, f), 'rb').read()
    args = {'contentLength': len(b), 'xVercelDigest': sha1(b), 'requestBody': base64.b64encode(b).decode()}
    ok = False
    for attempt in (1, 2):
        r = subprocess.run([BIN, 'call-tool', '--name', 'upload_file', '--arguments-json', json.dumps(args)],
                           capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and '"ok":true' in r.stdout:
            ok = True
            break
    if not ok:
        fails.append(f)
        print('UPLOAD FAIL:', f, (r.stdout or '')[:200], (r.stderr or '')[:200], flush=True)
    if i % 25 == 0:
        print('uploaded', i, '/', len(UPLOAD), flush=True)
print('uploads done. fails:', fails, flush=True)
json.dump({'manifest': manifest, 'fails': fails}, open('/tmp/cg_upload_result.json', 'w'))
