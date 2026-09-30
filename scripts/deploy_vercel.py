"""通过 Vercel REST API 部署静态站点 + Serverless 函数
用法: python scripts/deploy_vercel.py
依赖环境变量: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SKIP_DIRS = {'.git', '.workbuddy', 'node_modules', '.tmp', '.vercel', 'supabase', 'scripts', 'icons'}
SKIP_FILES = {'.deploy.env', '.gitignore'}
# 需要上传的文件（白名单，避免误传密钥）
INCLUDE_EXT = {'.html', '.css', '.js', '.json', '.webmanifest', '.png', '.md'}

token = os.environ.get('VERCEL_TOKEN')
project_id = os.environ.get('VERCEL_PROJECT_ID')
team_id = os.environ.get('VERCEL_TEAM_ID')
if not (token and project_id):
    sys.exit('missing VERCEL_TOKEN / VERCEL_PROJECT_ID')


def api(path, method='GET', body=None, headers=None):
    url = 'https://api.vercel.com' + path
    if team_id:
        url += ('&' if '?' in url else '?') + 'teamId=' + team_id
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit('API %s %s -> %s: %s' % (method, path, e.code, e.read().decode()[:400]))


files = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace('\\', '/')
        if fn in SKIP_FILES:
            continue
        if fn.startswith('.') and not fn.endswith('.webmanifest'):
            continue
        ext = os.path.splitext(fn)[1].lower()
        if ext not in INCLUDE_EXT and fn != 'sw.js':
            continue
        with open(os.path.join(dirpath, fn), 'rb') as f:
            content = f.read()
        sha = hashlib.sha1(content).hexdigest()
        api('/v2/files', 'POST', body=None, headers={
            'Content-Length': str(len(content)),
            'x-vercel-digest': sha,
            'Content-Type': 'application/octet-stream',
        }) if False else None
        # 上传文件内容
        url = 'https://api.vercel.com/v2/files'
        if team_id:
            url += '?teamId=' + team_id
        req = urllib.request.Request(url, method='POST', data=content)
        req.add_header('Authorization', 'Bearer ' + token)
        req.add_header('Content-Length', str(len(content)))
        req.add_header('x-vercel-digest', sha)
        req.add_header('Content-Type', 'application/octet-stream')
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                pass
        except urllib.error.HTTPError as e:
            sys.exit('upload fail %s: %s' % (rel, e.read().decode()[:200]))
        files.append({'file': rel, 'sha': sha, 'size': len(content)})
        print('uploaded', rel, len(content))

print('files:', len(files))
dep = api('/v13/deployments', 'POST', {
    'name': 'review-list',
    'project': project_id,
    'files': files,
    'projectSettings': {'framework': None, 'outputDirectory': None, 'buildCommand': None},
    'target': 'production',
})
print('deployment id:', dep.get('id'))
print('url:', dep.get('url'))
