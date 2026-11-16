'use strict';
const state=document.getElementById('state'),output=document.getElementById('log'),canvas=document.getElementById('canvas');
const lines=[];const version=new URLSearchParams(location.search).get('version')||'my-mods';
let logDirty=false;
function flushLog(){if(!logDirty)return;output.textContent=lines.join('\n');logDirty=false}
setInterval(()=>{if(document.getElementById('diagnostics').open)flushLog()},1000);
document.getElementById('diagnostics').addEventListener('toggle',flushLog);
function log(...args){const message=args.map(String).join(' ');if(message.startsWith('LONG DT @'))return;lines.push(message);if(lines.length>500)lines.shift();logDirty=true;if(/crashed|WEB LUA ERROR|ERRO JS/.test(message)){state.textContent='The game encountered an error. Check the diagnostics.';document.getElementById('diagnostics').open=true;flushLog()}}
window.alert=message=>log('RUNTIME:',message);window.onerror=(message,url,line,column,error)=>log('ERRO JS',message,error?.stack||'');
document.getElementById('save').onclick=async()=>{try{await Module.syncSaves();state.textContent='Progress saved in this browser.'}catch(e){state.textContent='Unable to save progress.';log(e.stack||e)}};
document.getElementById('fullscreen').onclick=()=>canvas.requestFullscreen().catch(e=>log(e.message));
document.getElementById('download-log').onclick=()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));link.download='balatro-diagnostics.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
loadCachedGame(version).then(game=>{
 if(!game){state.textContent='Version not found. Go back to build or import the game.';return}state.textContent=version;document.getElementById('start').disabled=false;
 document.getElementById('start').onclick=async()=>{document.getElementById('start').disabled=true;state.textContent='Starting '+version+'…';const data=await optimizeGame(game);const open=indexedDB.open.bind(indexedDB),remove=indexedDB.deleteDatabase.bind(indexedDB),prefix='BalatroMods_'+version+'_';indexedDB.open=(name,v)=>v===undefined?open(prefix+name):open(prefix+name,v);indexedDB.deleteDatabase=name=>remove(prefix+name);window.Module={INITIAL_MEMORY:536870912,canvas,print:log,printErr:log,arguments:['game.love'],locateFile:p=>'run/11.5/'+p,preRun:[()=>Module.FS_createDataFile('/','game.love',data,true,true,true)]};const script=document.createElement('script');script.src='run/11.5/love.min.js?v=20261103.2';script.onload=async()=>{try{state.textContent=version;canvas.focus();await Love(Module);document.getElementById('save').disabled=false}catch(e){log('ERRO JS',e.stack||e)}};script.onerror=()=>{state.textContent='Unable to load the game engine.'};document.body.append(script)};
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
 zip.file('web_compat.lua',source);
 return zip.generateAsync({type:'uint8array',compression:'STORE'});
}
