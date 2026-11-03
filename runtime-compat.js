(function(root){
  'use strict';
  const nativefs = `local nfs = {}
local cwd = ''
local function path(p)
  p = (p or ''):gsub('\\\\','/')
  local save = love.filesystem.getSaveDirectory()
  if p:sub(1,#save) == save then p = p:sub(#save+1):gsub('^/','') end
  if p:sub(1,5) == 'Mods/' or p == 'Mods' or p:sub(1,12) == 'web_modules/' then return p end
  if p:sub(1,1) == '/' then return p:sub(2) end
  if cwd ~= '' and p ~= '' then return cwd..'/'..p end
  return p ~= '' and p or cwd
end
function nfs.setWorkingDirectory(p)
  local save = love.filesystem.getSaveDirectory()
  if p == save or p == '/' or p == '' then cwd = '' else cwd = path(p):gsub('/$','') end
  return true
end
function nfs.getWorkingDirectory() return cwd end
function nfs.read(p,...)
 if p=='data' then local resolved=path((...)); if not love.filesystem.getInfo(resolved) then print('WEB: arquivo de áudio ausente: '..resolved); return nil,'Missing sound: '..resolved end; return love.filesystem.newFileData(resolved) end
 local resolved = path(p)
 if not love.filesystem.getInfo(resolved) then return nil,'File does not exist: '..resolved end
 return love.filesystem.read(resolved,...)
end
function nfs.write(p,...) return love.filesystem.write(path(p),...) end
function nfs.getInfo(p,...) return love.filesystem.getInfo(path(p),...) end
function nfs.exists(p) return nfs.getInfo(p) ~= nil end
function nfs.getDirectoryItems(p) return love.filesystem.getDirectoryItems(path(p)) end
function nfs.getDirectoryItemsInfo(p)
  local items = {}
  for _,name in ipairs(nfs.getDirectoryItems(p)) do
    local info = nfs.getInfo((p == '' and '' or p..'/')..name)
    if info then info.name = name; items[#items+1] = info end
  end
  return items
end
function nfs.createDirectory(p) return love.filesystem.createDirectory(path(p)) end
nfs.mkdir = nfs.createDirectory
function nfs.append(p,s) local old=nfs.read(p) or ''; return nfs.write(p,old..s) end
function nfs.getNormalizedPath(p)
 if nfs.getInfo(p) then return p end
 local normalized=p:gsub('\\\\','/'):gsub('/$','')
 local parent,base=normalized:match('^(.*)/([^/]+)$')
 if not parent then return p end
 parent=nfs.getNormalizedPath(parent)
 for _,name in ipairs(nfs.getDirectoryItems(parent)) do if name:lower()==base:lower() then return parent..'/'..name end end
 return normalized
end
function nfs.mount() return false,'ZIP mods must be extracted before export' end
function nfs.smodsAddRedirect() return false,'ZIP mods must be extracted before export' end
function nfs.remove(p) return love.filesystem.remove(path(p)) end
function nfs.load(p) local s,e = nfs.read(p); if not s then return nil,e end; return loadstring(s,'@'..p) end
function nfs.newFileData(p) return love.filesystem.newFileData(path(p)) end
function nfs.lines(p)
  local s = assert(nfs.read(p)); local pos=1
  return function() if pos > #s then return nil end; local i=s:find('\\n',pos,true); local out=s:sub(pos,i and i-1 or #s); pos=i and i+1 or #s+1; return out end
end
return nfs`;
  const lovely = `local vars = {}
local function shader(name, code)
 if not code then return nil,'Missing shader source' end
 -- GLSL ES requires explicit float literals; desktop GLSL accepts mixed ints.
 code=code:gsub('([^%w_.]%d+)([^%w_.])','%1.%2')
 code=code:gsub('([^%w_.]%d+)([^%w_.])','%1.%2')
 code=code:gsub('([%s%(%{])int([%s%(%[])','%1 float%2')
 code=code:gsub('(__[%w_]+__%s*[<>]%s*%d+)%.','%1')
 code=code:gsub('([%d.]e%-?%d+)%.','%1')
 code=code:gsub('%[(%d+)%.%]','[%1]')
 code=code:gsub('%[([^%[%]]+)%]',function(index) if tonumber(index) then return '['..index..']' else return '[int('..index..')]' end end)
 code=code:gsub('(%d+%.?%d*)f([^%w_])','%1%2')
 code=code:gsub('mediump%s+float','highp float')
 return code
end
return {
 version = '0.10.0', mod_dir = 'Mods/', log_file = 'web-session.log',
 get_var = function(k) return vars[k] end,
 set_var = function(k,v) vars[k]=tostring(v) end,
 remove_var = function(k) local v=vars[k]; vars[k]=nil; return v end,
 reload_patches = function() return false, 'Recompile o perfil para alterar os patches no navegador.' end,
 apply_patches = shader
}`;

  function bootstrap(manifest) {
    const preload = (manifest.modules || []).filter(m => !['nativefs','SMODS.nativefs','luajit-curl','SMODS.https'].includes(m.name)).map(m => `package.preload[${JSON.stringify(m.name)}] = function() return assert(love.filesystem.load(${JSON.stringify('web_modules/'+m.name.replaceAll('.','/')+'.lua')}))() end`).join('\n');
    const loadNow = (manifest.loadNow || []).map(m => `require(${JSON.stringify(m)})`).join('\n');
    return `-- Compatibility for this browser build only; native installations are untouched.
local fsread = love.filesystem.read
love.filesystem.read = function(p, ...)
 if type(p)=='string' and not love.filesystem.getInfo(p) then return nil,'File does not exist: '..p end
 return fsread(p,...)
end
love.filesystem.append = function(p,data)
 local previous=love.filesystem.read(p) or ''
 return love.filesystem.write(p,previous..data)
end
table.insert(package.loaders, 2, function(name)
 local filename=name:gsub('%.','/')
 for template in package.path:gmatch('[^;]+') do
  local candidate=template:gsub('%?',filename)
  if love.filesystem.getInfo(candidate) then return assert(love.filesystem.load(candidate)) end
 end
 return '\\n\\tno module in browser filesystem: '..name
end)
local image = love.graphics.newImage
local setMode=love.window.setMode
love.window.setMode=function(w,h,flags)
 flags=flags or {}; flags.fullscreen=false
 return setMode(w,h,flags)
end
love.window.setFullscreen=function() return false end
-- The upstream wrapper expects a config table even when the caller omits it.
love.graphics.newImage = function(p, options) return image(p,options or {}) end
local sounds = {}
local newSource=love.audio.newSource
love.audio.newSource=function(data,kind)
 if type(data)=='string' then
  local key=data:match('^resources/sounds/(.*)%.ogg$')
  if key and sounds[key] then
   if not sounds[key].data then return newSource(love.sound.newSoundData(1,44100,16,1),'static') end
   data=sounds[key].data
  end
 end
 return newSource(data,kind)
end
function __web_create_sound_manager()
 return {channel={push=function(_,request)
  if request.type=='sound_source' then sounds[request.sound_code]=request; if SOURCES then SOURCES[request.sound_code]={} end
  elseif request.type=='stop' and STOP_AUDIO then STOP_AUDIO()
  elseif request.type=='sound' and PLAY_SOUND then PLAY_SOUND(request)
  end
 end}}
end
package.preload['nativefs'] = function() return assert(love.filesystem.load('nativefs.lua'))() end
package.preload['SMODS.nativefs'] = function() return require('nativefs') end
package.preload['socket'] = function()
 return {tcp=function() return {settimeout=function()end,connect=function()return nil,'Browser: TCP indisponível'end,close=function()end} end}
end
package.preload['https'] = function() return {request=function()return nil,'HTTP nativo indisponível nesta versão web'end} end
package.preload['SMODS.https'] = package.preload['https']
package.preload['luajit-curl'] = package.preload['https']
-- LuaJIT numeric comparisons must retain their behavior after cdata becomes tables.
function __web_compare(op,a,b)
 local big = rawget(_G,'Big')
 local isa = big and big.is and big.is(a)
 local isb = big and big.is and big.is(b)
 if (isa and (isb or type(b)=='number')) or (isb and type(a)=='number') then
  -- Table identity bypasses __eq, which would incorrectly make Big.NaN equal
  -- to itself. Compare numerically and keep NaN unordered, as LuaJIT does.
  local comparison=big.compareTo(a,b)
  if op=='<' then return comparison<0 elseif op=='>' then return comparison>0 elseif op=='<=' then return comparison<=0 elseif op=='>=' then return comparison>=0 elseif op=='==' then return comparison==0 else return comparison~=0 end
 end
 if op=='<' then return a<b elseif op=='>' then return a>b elseif op=='<=' then return a<=b elseif op=='>=' then return a>=b elseif op=='==' then return a==b else return a~=b end
end
local newFont = love.graphics.newFont
love.graphics.newFont = function(...) return newFont(...) end
local compileShader=love.graphics.newShader
love.graphics.newShader=function(...)
 local shader=compileShader(...)
 local mt=getmetatable(shader)
 if not mt._web_send then
  mt._web_send=true
  local send=mt.send
  mt.send=function(self,name,...)
   local values,n={...},select('#',...)
   local ok,result=pcall(send,self,name,unpack(values,1,n))
   if not ok then print('WEB shader send failed: '..tostring(name)..' values='..n..' first='..type(values[1])..' second='..type(values[2])); error(result) end
   return result
  end
 end
 return shader
end
-- Never execute native processes through a web build.
os.execute = function() return nil,'Processos nativos indisponíveis no navegador' end
io.popen = function() return nil,'Processos nativos indisponíveis no navegador' end
${preload}
${loadNow}
`;
  }
  root.WebRuntime = {nativefs, lovely, bootstrap};
})(globalThis);
