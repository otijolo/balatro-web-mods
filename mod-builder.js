/* Browser-local builder. Input archives and game files never leave the browser. */
(function (root) {
  'use strict';
  const unsafePath = p => p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..');
  const normalize = p => p.replaceAll('\\', '/').replace(/^\.\//, '');
  const decoder = new TextDecoder();
  const jszip = () => root.JSZip;

  async function unpack(data) {
    const bytes = new Uint8Array(await data.arrayBuffer());
    let offset = -1;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 80 && bytes[i + 1] === 75 && bytes[i + 2] === 3 && bytes[i + 3] === 4) { offset = i; break; }
    }
    if (offset < 0) throw new Error('O arquivo não contém um ZIP de jogo válido. Escolha Balatro.exe ou um arquivo .love.');
    return jszip().loadAsync(bytes.subarray(offset), {checkCRC32: true});
  }

  async function readProfile(data) {
    const zip = await jszip().loadAsync(await data.arrayBuffer(), {checkCRC32:true});
    const result = new Map();
    let size = 0;
    for (const [name, entry] of Object.entries(zip.files)) {
      const path = normalize(entry.unsafeOriginalName || name);
      if (unsafePath(path)) throw new Error('Caminho inválido no pacote de mods: ' + path);
      if (!entry.dir) {
        const bytes = await entry.async('uint8array');
        size += bytes.length;
        if (size > 700 * 1024 * 1024) throw new Error('Pacote de mods muito grande (limite descompactado: 700 MB).');
        result.set(path, bytes);
      }
    }
    if (!result.has('profile.json')) throw new Error('Escolha o ZIP de perfil criado pelo preparar-perfil.py incluído neste projeto.');
    const manifest = JSON.parse(decoder.decode(result.get('profile.json')));
    if (manifest.format !== 'balatro-web-profile-1') throw new Error('Formato de perfil não reconhecido.');
    if (!result.has('dump/main.lua')) throw new Error('O perfil não contém o dump/main.lua do Lovely. Inicie o jogo modificado no PC antes de preparar o perfil.');
    return { files:result, manifest };
  }

  function rewriteComparisons(source) {
    // LuaJIT cdata supports number comparisons; Lua 5.1 tables require both operands to be tables.
    const ast = root.luaparse.parse(source, {luaVersion:'5.2', extendedIdentifiers:true, ranges:true, comments:false, scope:false});
    const targets = new Map();
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type==='GotoStatement' || node.type==='LabelStatement') throw new Error('Salto goto ainda não adaptado para o navegador. Esta versão do mod precisa de uma adaptação específica.');
      if (node.type === 'BinaryExpression' && ['<','>','<=','>=','==','~='].includes(node.operator)) {
        const list = targets.get(node.range[0]) || []; list.push(node); targets.set(node.range[0], list);
      }
      for (const [key, val] of Object.entries(node)) {
        if (key === 'range' || key === 'loc') continue;
        if (Array.isArray(val)) val.forEach(walk); else if (val && typeof val === 'object') walk(val);
      }
    }
    walk(ast);
    function render(start, end, skip) {
      let out = '', cursor = start;
      for (let i = start; i < end; i++) {
        const node = (targets.get(i)||[]).find(n => n !== skip && n.range[1] <= end);
        if (!node || node === skip || node.range[1] > end) continue;
        out += source.slice(cursor, i) + '__web_compare(' + JSON.stringify(node.operator) + ',' + render(node.left.range[0], node.left.range[1]) + ',' + render(node.right.range[0], node.right.range[1]) + ')';
        cursor = node.range[1]; i = cursor - 1;
      }
      return out + source.slice(cursor, end);
    }
    return render(0, source.length);
  }

  async function build(gameFile, profile, onProgress = () => {}) {
    onProgress('Lendo sua cópia do Balatro…', 5);
    const game = await unpack(gameFile);
    if (!game.file('main.lua') || !game.file('globals.lua')) throw new Error('Este arquivo não parece ser uma cópia do Balatro.');
    let manifest = {mods:[], modules:[], loadNow:[]};
    if (profile) {
      manifest = profile.manifest;
      onProgress('Importando mods e o dump do Lovely…', 15);
      for (const [path, bytes] of profile.files) {
        if (path.startsWith('mods/')) game.file('Mods/' + path.slice(5), bytes);
        if (path.startsWith('dump/') && !path.endsWith('.json')) game.file(path.slice(5), bytes);
      }
      for (const module of manifest.modules || []) {
        let source = profile.files.get('mods/' + module.folder + '/' + module.source);
        const dumped = 'dump/lovely/' + module.name.replaceAll('.', '/') + '/' + module.source;
        source = profile.files.get(dumped) || source;
        if (!source) throw new Error('Módulo ausente: ' + module.name);
        game.file('web_modules/' + module.name.replaceAll('.', '/') + '.lua', source);
      }
      // Patched files loaded through SMODS.NFS.read must replace their mod source too.
      const smods = manifest.mods.find(m => m.id === 'Steamodded');
      if (smods) for (const [path, bytes] of profile.files) {
        if (path.startsWith('dump/SMODS/_/')) game.file('Mods/' + smods.folder + '/' + path.slice('dump/SMODS/_/'.length), bytes);
      }
      const amulet = manifest.mods.find(m => m.id === 'Amulet');
      if (amulet) for (const [path, bytes] of profile.files) {
        const prefix = 'mods/' + amulet.folder + '/';
        if (path.startsWith(prefix + 'talisman/') || path.startsWith(prefix + 'big-num/')) game.file(path.slice(prefix.length), bytes);
      }
    }
    for (const [name, source] of Object.entries(root.patches)) game.file(name, source);
    game.file('nativefs.lua', root.WebRuntime.nativefs);
    game.file('lovely.lua', root.WebRuntime.lovely);
    game.file('web_compat.lua', root.WebRuntime.bootstrap(manifest));
    let main = await game.file('main.lua').async('string');
    main = main.replace("if os == 'OS X' or os == 'Windows' then", 'if false then');
    main = main.replace('G:start_up()', 'G.SOUND_MANAGER = __web_create_sound_manager()\n G:start_up()');
    game.file('main.lua', main);
    let globals = await game.file('globals.lua').async('string');
    game.file('globals.lua', globals.replace('F_SOUND_THREAD = true', 'F_SOUND_THREAD = false'));
    const hologram = game.file('resources/shaders/hologram.fs');
    if (hologram) game.file(hologram.name, (await hologram.async('string')).replace(/glow_samples;/g, '4;'));
    for (const file of Object.values(game.files)) {
      if (!file.dir && file.name.endsWith('.fs')) {
        let shader=await file.async('string');
        const patches=(manifest.shaderPatches||[]).filter(p=>p.spec.target===file.name.split('/').pop()).sort((a,b)=>a.priority-b.priority);
        for(const {kind,spec} of patches){
          if(kind==='pattern'){
            let matched=spec.pattern;
            if(spec.pattern.includes('*')){
              const expression=spec.pattern.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^\\r\\n]*');
              shader=shader.replace(new RegExp(expression,'g'),match=>spec.position==='before'?(spec.payload||'')+'\n'+match:spec.position==='after'?match+'\n'+(spec.payload||''):(spec.payload||''));
              continue;
            }
            const at=shader.indexOf(matched);if(at<0)continue;
            const payload=spec.payload||'';
            if(spec.position==='before')shader=shader.slice(0,at)+payload+'\n'+shader.slice(at);
            else if(spec.position==='after')shader=shader.slice(0,at+matched.length)+'\n'+payload+shader.slice(at+matched.length);
            else shader=shader.slice(0,at)+payload+shader.slice(at+matched.length);
          }else{
            const pattern=new RegExp(spec.pattern,'gm');
            const payload=(spec.payload||'').replace(/\$([a-zA-Z_]\w*)/g,'$$<$1>');
            shader=shader.replace(pattern,spec.position==='before'?payload+'\n$&':spec.position==='after'?'$&\n'+payload:payload);
          }
        }
        game.file(file.name,shader+'\n');
      }
      if (!file.dir && file.name.endsWith('/shaders/blur.fs')) {
        const shader = await game.file(file.name).async('string');
        game.file(file.name, shader.replace(/\bfloat (direction|quality|size|two_pi|d_step|i_step)\s*=/g, 'const float $1 =') + '\n');
      }
    }

    const luaFiles = Object.values(game.files).filter(f => !f.dir && f.name.endsWith('.lua'));
    let n = 0;
    for (const file of luaFiles) {
      let source = (await file.async('string')).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
      for (const mod of manifest.mods) {
        if (mod.originalPath) source = source.replaceAll(mod.originalPath.replaceAll('\\','/'), 'Mods/' + mod.folder).replaceAll(mod.originalPath.replaceAll('\\','\\\\'), 'Mods/' + mod.folder).replaceAll(mod.originalPath, 'Mods/' + mod.folder);
      }
      source = root.WebLuaCompat.transform(file.name, source);
      // Lua 5.1's legacy vararg table named `arg` shadows a parameter with that name.
      if (file.name.endsWith('talisman/break_inf/sanitizer.lua') || file.name.endsWith('talisman/smods/gradients.lua')) source=source.replace(/\barg\b/g,'web_argument');
      // Only patched/mod source needs cdata compatibility. Engine shaders are handled separately.
      if (profile && !['web_compat.lua','web_patches.lua','bit.lua','lovely.lua','nativefs.lua'].includes(file.name)) {
        try { source = rewriteComparisons(source); }
        catch (err) { throw new Error('Lua incompatível em ' + file.name + ': ' + err.message); }
      }
      game.file(file.name, source);
      n++;
      if (n % 40 === 0) { onProgress('Adaptando Lua (' + n + '/' + luaFiles.length + ')…', 25 + 55 * n/luaFiles.length); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    game.file('main.lua', 'require "web_patches"\nrequire "web_compat"\n' + await game.file('main.lua').async('string'));
    game.file('web_patched','true');
    onProgress('Montando a versão local…', 85);
    const bytes = await game.generateAsync({type:'uint8array', compression:'DEFLATE', compressionOptions:{level:1}});
    onProgress('Pronto para iniciar.', 100);
    return new Blob([bytes], {type:'application/zip'});
  }
  root.WebModBuilder = {build, readProfile, rewriteComparisons};
})(globalThis);
