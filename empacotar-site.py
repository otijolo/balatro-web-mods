"""Copy only the distributable web application into _site/ for static hosting."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parent
target=root/'_site'
target.mkdir(exist_ok=True)
files=['gato-misil.gif','index.html','site.css','site.js','player.html','player.js','cache.js','patches.js','compat-lua.js','runtime-compat.js','mod-builder.js','license.txt','lib/jszip.min.js','lib/luaparse.js','lib/luaparse.LICENSE','run/11.5/love.min.js','run/11.5/love.wasm']
for name in files:
    source=root/name
    destination=target/name
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,destination)
unexpected=[p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file() and p.relative_to(target).as_posix() not in files]
if unexpected: raise SystemExit('Unexpected files in the deployment folder: '+', '.join(unexpected))
print(f'{len(files)} public files prepared in {target}')
