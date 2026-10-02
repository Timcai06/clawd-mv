import re, glob, os, collections
def group(files, key):
    g=collections.defaultdict(str)
    for f in files:
        g[key(os.path.basename(f))]+=open(f).read()+"\n"
    return g
P=group(glob.glob('reference/pdoom/scenes/*.ts'), lambda b: b.split('.')[0].split('-')[0])
O=group(glob.glob('app/src/scenes/s*.ts')+glob.glob('app/src/scenes/parts/s*.ts'), lambda b: b[:3])
feat = {
 'lines': lambda s: s.count('\n'),
 'persp': lambda s: len(re.findall(r'PerspectiveCamera', s)),
 '3Dmesh': lambda s: len(re.findall(r'new THREE\.(Mesh|InstancedMesh|Points|LineSegments)\(', s)),
 'geomSeg': lambda s: max([int(a)*int(b) for a,b in re.findall(r'PlaneGeometry\([^,]+,[^,]+,\s*(\d+),\s*(\d+)', s)] or [0]),
 'vtxDisp': lambda s: len(re.findall(r'gl_Position\s*=.*\n?', s)) if 'VERT' in s else 0,
 'shaders': lambda s: len(re.findall(r'(FSPass\(|RawShaderMaterial\(|ShaderMaterial\()', s)),
 'raymarch': lambda s: len(re.findall(r'(march|for \(int i = 0; i < \d+; i\+\+\)[^\n]*\n[^\n]*(sd|map)\()', s, re.I)),
 'normals/light': lambda s: len(re.findall(r'dot\(n,|normalize\(vec3\(-?h|lamb|tanaka|fresnel', s)),
 'contour/hatch': lambda s: len(re.findall(r'contour\(|hatch\(|engrave\(', s)),
 'LineBatch3D': lambda s: len(re.findall(r'LineBatch\([^)]*screen2D:\s*false', s)),
 'proj()': lambda s: len(re.findall(r'\.proj\(|project\(', s)),
 'sparks': lambda s: len(re.findall(r'sparkParticles|sparkHead|cursorSpark', s)),
 'wordTimes': lambda s: len(re.findall(r"\.start\b|\.end\b|wordProgress", s)),
 'beatGrid': lambda s: len(re.findall(r'beatAt|timeOfBeat|downbeats|beats\b|afterBeats|beatsSince', s)),
 'camPhases': lambda s: len(re.findall(r'(else if \(t < this\.t|phase|ph\.id ===|case \')', s)),
 'eases': lambda s: len(re.findall(r'ease\.\w+|springStep|pulse\(', s)),
}
def table(G, title):
    print(f'== {title}')
    print('scene'.ljust(11)+' '.join(k[:9].rjust(9) for k in feat))
    tot=collections.Counter()
    for k in sorted(G):
        vals=[feat[f](G[k]) for f in feat]
        for f,v in zip(feat,vals): tot[f]+=v
        print(k.ljust(11)+' '.join(str(v).rjust(9) for v in vals))
    print('TOTAL'.ljust(11)+' '.join(str(tot[f]).rjust(9) for f in feat))
table(P,'pdoom'); table(O,'ours')
