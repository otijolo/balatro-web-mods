"""Export local mod inputs without changing the installed profile. No game files included."""
import argparse
import json
import os
from pathlib import Path
import tomllib
import zipfile

parser = argparse.ArgumentParser(description='Prepara um perfil r2modman para o Balatro Web.')
parser.add_argument('--perfil', type=Path, default=Path(os.environ.get('APPDATA', '.'))/'r2modmanPlus-local/Balatro/profiles/Default')
parser.add_argument('--saida', type=Path, required=True)
args = parser.parse_args()
mods = args.perfil/'mods'
dump = mods/'lovely/dump'
if not (dump/'main.lua').is_file():
    raise SystemExit('Não há dump do Lovely. Abra e feche o jogo modificado no r2modman primeiro.')
manifest = {'format':'balatro-web-profile-1', 'mods':[], 'modules':[], 'loadNow':[], 'shaderPatches':[]}
folders = []
blacklist = set((mods/'lovely/blacklist.txt').read_text(encoding='utf-8-sig').splitlines()) if (mods/'lovely/blacklist.txt').is_file() else set()
for folder in sorted(mods.iterdir()):
    if not folder.is_dir() or folder.name in {'lovely','Steamopollys-Steamodded','metherul-nativefs'} or folder.name in blacklist or (folder/'lovelyignore').exists():
        continue
    metadata = None
    for candidate in folder.glob('*.json'):
        try:
            value = json.loads(candidate.read_text(encoding='utf-8-sig'))
            if isinstance(value,dict) and 'id' in value and 'main_file' in value:
                metadata = value
                break
        except (ValueError, OSError):
            continue
    if metadata is None and folder.name == 'Steamodded-Steamodded':
        metadata = {'id':'Steamodded','name':'Steamodded'}
    folders.append(folder)
    manifest['mods'].append({'folder':folder.name, 'id':(metadata or {}).get('id',folder.name), 'name':(metadata or {}).get('name',folder.name), 'originalPath':str(folder)})
    tomls = list((folder/'lovely').rglob('*.toml'))
    if (folder/'lovely.toml').is_file(): tomls.append(folder/'lovely.toml')
    for toml in tomls:
        data = tomllib.loads(toml.read_text(encoding='utf-8-sig'))
        for patch in data.get('patches',[]):
            for kind in ('pattern','regex'):
                spec = patch.get(kind,{})
                targets=spec.get('target',[])
                if isinstance(targets,str): targets=[targets]
                for target in targets:
                    if target.endswith('.fs') and target != 'GLSL_ES_PATCHES.fs':
                        manifest['shaderPatches'].append({'kind':kind,'spec':dict(spec,target=target),'priority':data.get('manifest',{}).get('priority',0)})
            if 'module' in patch:
                module = dict(patch['module'],folder=folder.name)
                manifest['modules'].append(module)
                if module.get('load_now'): manifest['loadNow'].append(module['name'])
args.saida.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.saida,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as archive:
    archive.writestr('profile.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    for folder in folders:
        for file in folder.rglob('*'):
            if file.is_file() and not any(x in file.parts for x in ('.git','__pycache__')):
                archive.write(file,'mods/'+folder.name+'/'+file.relative_to(folder).as_posix())
    for file in dump.rglob('*'):
        if file.is_file() and not file.name.endswith('.json'):
            archive.write(file,'dump/'+file.relative_to(dump).as_posix())
print(f'Perfil preparado: {args.saida} ({args.saida.stat().st_size/1048576:.1f} MB)')
print('Este ZIP inclui dumps do seu jogo. Use localmente; não publique nem envie ao GitHub.')
