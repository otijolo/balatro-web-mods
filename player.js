'use strict';
const state=document.getElementById('state'),output=document.getElementById('log'),canvas=document.getElementById('canvas');
const lines=[];const version=new URLSearchParams(location.search).get('version')||'my-mods';
let logDirty=false;
function flushLog(){if(!logDirty)return;output.textContent=lines.join('\n');logDirty=false}
setInterval(()=>{if(document.getElementById('diagnostics').open)flushLog()},1000);
document.getElementById('diagnostics').addEventListener('toggle',flushLog);
function log(...args){const message=args.map(String).join(' ');if(message.startsWith('LONG DT @'))return;lines.push(message);if(lines.length>500)lines.shift();logDirty=true;if(/crashed|WEB LUA ERROR|ERRO JS/.test(message)){state.textContent='The game encountered an error. Check the diagnostics.';document.getElementById('diagnostics').open=true;flushLog()}}
document.addEventListener('visibilitychange',()=>log('PAGE visibility:',document.visibilityState,new Date().toISOString()));
window.alert=message=>log('RUNTIME:',message);window.onerror=(message,url,line,column,error)=>log('ERRO JS',message,error?.stack||'');
document.getElementById('save').onclick=async()=>{try{await Module.syncSaves();state.textContent='Progress saved in this browser.'}catch(e){state.textContent='Unable to save progress.';log(e.stack||e)}};
document.getElementById('fullscreen').onclick=()=>canvas.requestFullscreen().catch(e=>log(e.message));
document.getElementById('download-log').onclick=()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));link.download='balatro-diagnostics.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
loadCachedGame(version).then(game=>{
 if(!game){state.textContent='Version not found. Go back to build or import the game.';return}state.textContent=version;document.getElementById('start').disabled=false;
 document.getElementById('start').onclick=async()=>{document.getElementById('start').disabled=true;state.textContent='Starting '+version+'…';const data=await optimizeGame(game);const open=indexedDB.open.bind(indexedDB),remove=indexedDB.deleteDatabase.bind(indexedDB),prefix='BalatroMods_'+version+'_';indexedDB.open=(name,v)=>v===undefined?open(prefix+name):open(prefix+name,v);indexedDB.deleteDatabase=name=>remove(prefix+name);window.Module={INITIAL_MEMORY:536870912,canvas,print:log,printErr:log,arguments:['game.love'],locateFile:p=>'run/11.5/'+p,preRun:[()=>Module.FS_createDataFile('/','game.love',data,true,true,true)]};const script=document.createElement('script');script.src='run/11.5/love.min.js?v=20261116.4';script.onload=async()=>{try{state.textContent=version;canvas.focus();await Love(Module);document.getElementById('save').disabled=false}catch(e){log('ERRO JS',e.stack||e)}};script.onerror=()=>{state.textContent='Unable to load the game engine.'};document.body.append(script)};
}).catch(e=>{state.textContent=e.message;log(e.stack||e)});

async function optimizeGame(game){
 const zip=await JSZip.loadAsync(await game.arrayBuffer());
 const entry=zip.file('web_compat.lua');
 if(!entry)return new Uint8Array(await game.arrayBuffer());
 let source=await entry.async('string');
 const current=WebRuntime.bootstrap({modules:[],loadNow:[]});
 const start=source.indexOf('function __web_compare('),end=source.indexOf('local newFont =',start);
 if(start<0||end<0) return new Uint8Array(await game.arrayBuffer());
 const replacement=current.slice(current.indexOf('function __web_compare('),current.indexOf('local newFont ='));
 source=source.slice(0,start)+replacement+source.slice(end);
 const shaderStart=source.indexOf('local compileShader=love.graphics.newShader');
 const shaderEnd=source.indexOf('-- Never execute',shaderStart);
 if(shaderStart>=0&&shaderEnd>shaderStart)source=source.slice(0,shaderStart)+source.slice(shaderEnd);
 const httpStart=source.indexOf("package.preload['https'] =");
 const httpEnd=source.indexOf("package.preload['SMODS.https']",httpStart);
 const newHttpStart=current.indexOf("package.preload['https'] =");
 const newHttpEnd=current.indexOf("package.preload['SMODS.https']",newHttpStart);
 if(httpStart>=0&&httpEnd>httpStart)source=source.slice(0,httpStart)+current.slice(newHttpStart,newHttpEnd)+source.slice(httpEnd);
 zip.file('web_compat.lua',source);
 const packer=zip.file('engine/string_packer.lua');
 if(packer)zip.file('engine/string_packer.lua',WebRuntime.optimizeSaveSource(await packer.async('string')));
 for(const file of Object.values(zip.files)){
  if(!file.dir&&file.name.endsWith('.lua')){
   const text=await file.async('string');
   if(text.includes('__web_compare(')&&file.name!=='web_compat.lua')zip.file(file.name,WebComparisonOptimizer.optimize(text));
  }
 }
 const dynamicText=zip.file('engine/text.lua');
 if(dynamicText){
  const text=await dynamicText.async('string');
  const call='love.graphics.newText(self.font.FONT, c)';
  if(text.includes(call))zip.file('engine/text.lua',WebRuntime.glyphCacheLua+'\n'+text.replaceAll(call,'web_cached_glyph(self.font.FONT, c)'));
 }
 const main=zip.file('main.lua');
 if(main){
  const original=await main.async('string');
  if(!original.includes('-- web frame timings'))zip.file('main.lua',original+`
-- web frame timings: CPU callback time, not GPU completion time.
local function install_web_frame_timings()
 local update,draw=love.update,love.draw
 local now=love.timer.getTime
 local stages={}
 local function pack(...) return {n=select('#',...),...} end
 local function measure(owner,key,label)
  if not owner or type(owner[key])~='function' then return end
  local original=owner[key]
  local stat={name=label,time=0,calls=0}; stages[#stages+1]=stat
  owner[key]=function(...)
   local t=now(); local result=pack(original(...))
   stat.time=stat.time+now()-t; stat.calls=stat.calls+1
   return unpack(result,1,result.n)
  end
 end
 measure(_G,'nuGC','garbage collection')
 measure(_G,'copy_card','copy card')
 measure(_G,'create_UIBox_run_setup','run setup')
 measure(UIBox,'init','UI boxes')
 measure(DynaText,'init','animated text')
 measure(Card,'init','cards')
 measure(Game,'save_progress','save progress')
 measure(G and G.UIDEF,'view_deck','view deck')
 measure(G and G.FUNCS,'change_viewed_back','change deck')
 measure(G and G.FUNCS,'change_stake','change stake')
 local started,last=now(),now()
 local frames,updateTime,drawTime,stalls=0,0,0,0
 local worstFrame,worstUpdate,worstDraw=0,0,0
 if update then love.update=function(dt)
  local t=now(); local gap=t-last; if gap>0.05 then stalls=stalls+1 end; worstFrame=math.max(worstFrame,gap); last=t
  for _,stat in ipairs(stages) do stat.time=0; stat.calls=0 end
  update(dt); local cost=now()-t; updateTime=updateTime+cost; worstUpdate=math.max(worstUpdate,cost); frames=frames+1
  if cost>=0.1 then
   local details={}
   for _,stat in ipairs(stages) do
    if stat.calls>0 then details[#details+1]=string.format('%s %.1f ms (%d calls)',stat.name,stat.time*1000,stat.calls) end
   end
   print(string.format('PERF slow update: %.1f ms; inclusive stages: ',cost*1000)..table.concat(details,'; '))
  end
  local elapsed=now()-started
  if elapsed>=10 and frames>0 then
   print(string.format('PERF: %.1f FPS; update %.2f ms; draw CPU %.2f ms; frames over 50 ms: %d',frames/elapsed,1000*updateTime/frames,1000*drawTime/frames,stalls))
   print(string.format('PERF peaks: frame %.1f ms; update %.1f ms; draw CPU %.1f ms; Lua memory %.1f MB',worstFrame*1000,worstUpdate*1000,worstDraw*1000,collectgarbage('count')/1024))
   started=now(); frames=0; updateTime=0; drawTime=0; stalls=0; worstFrame=0; worstUpdate=0; worstDraw=0
  end
 end end
 if draw then love.draw=function(...) local t=now(); draw(...); local cost=now()-t; drawTime=drawTime+cost; worstDraw=math.max(worstDraw,cost) end end
 print('PERF: frame timing enabled after mod initialization')
end
local original_load=love.load
love.load=function(...)
 if original_load then original_load(...) end
 install_web_frame_timings()
end
`);
 }
 return zip.generateAsync({type:'uint8array',compression:'STORE'});
}
