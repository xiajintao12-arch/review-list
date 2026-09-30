"""用 GitHub Contents API 把本地仓库文件同步到远端（git push 不可用时的兜底）
用法: python scripts/push_github_api.py
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

OWNER = 'xiajintao12-arch'
REPO = 'review-list'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TOKEN = os.environ.get('GH_TOKEN')
if not TOKEN:
    sys.exit('missing GH_TOKEN')


def api(path, method='GET', body=None):
    url = 'https://api.github.com' + path
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', 'token ' + TOKEN)
    req.add_header('Accept', 'application/vnd.github+json')
    data = json.dumps(body).encode() if body is not None else None
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, data, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'_error': e.code, '_body': e.read().decode()[:200]}


remote = api('/repos/%s/%s/git/trees/main?recursive=1' % (OWNER, REPO))
remote_files = {}
if isinstance(remote, dict) and remote.get('tree'):
    for item in remote['tree']:
        if item['type'] == 'blob':
            remote_files[item['path']] = item['sha']

out = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True)
local_files = [p.strip() for p in out.stdout.splitlines() if p.strip()]
print('local files:', len(local_files), 'remote files:', len(remote_files))

uploaded = 0
for rel in local_files:
    full = os.path.join(ROOT, rel)
    if not os.path.exists(full):
        continue
    with open(full, 'rb') as f:
        content = f.read()
    b64 = base64.b64encode(content).decode()
    urlpath = '/repos/%s/%s/contents/%s' % (OWNER, REPO, urllib.parse.quote(rel))
    cur = api(urlpath)
    if isinstance(cur, dict) and not cur.get('_error'):
        try:
            existing = base64.b64decode(cur['content']).decode('utf-8', 'ignore')
        except Exception:
            existing = ''
        if cur.get('sha') and len(content) == cur.get('size') and existing == content.decode('utf-8', 'ignore'):
            continue
    body = {'message': 'update ' + rel, 'content': b64}
    if isinstance(cur, dict) and cur.get('sha'):
        body['sha'] = cur['sha']
    res = api(urlpath, 'PUT', body)
    if isinstance(res, dict) and res.get('_error'):
        print('FAIL', rel, res['_error'], res['_body'])
    else:
        uploaded += 1
        print('up', rel)

deleted = 0
for rel in remote_files:
    if rel not in local_files:
        res = api('/repos/%s/%s/contents/%s' % (OWNER, REPO, urllib.parse.quote(rel)), 'DELETE',
                  {'message': 'remove ' + rel, 'sha': remote_files[rel]})
        if isinstance(res, dict) and res.get('_error'):
            print('DEL FAIL', rel, res['_error'])
        else:
            deleted += 1
            print('del', rel)

print('uploaded', uploaded, 'deleted', deleted)
