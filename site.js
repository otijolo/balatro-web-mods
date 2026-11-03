'use strict';
const el=id=>document.getElementById(id);
let selectedProfile=null;
function status(message,error=false){el('status').textContent=message;el('status').classList.toggle('error',error)}
async function downloadGame(name){const blob=await loadCachedGame(name);if(!blob)throw Error('Version not found.');const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='balatro-'+name.replace(/[^\p{L}\p{N}_-]/gu,'_')+'.love';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}
async function renderLibrary(){
 const names=await listCachedVersions(),list=el('versions');list.replaceChildren();
 if(!names.length){const p=document.createElement('p');p.className='empty';p.textContent='No versions built yet.';list.append(p)}
 for(const name of names){const row=document.createElement('div');row.className='version';const title=document.createElement('strong');title.textContent=name;const actions=document.createElement('div');actions.className='version-actions';const play=document.createElement('a');play.className='play';play.href='player.html?version='+encodeURIComponent(name);play.textContent='Play';const download=document.createElement('button');download.textContent='Download';download.onclick=()=>downloadGame(name).catch(e=>status(e.message,true));const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=async()=>{if(confirm('Remove version “'+name+'” from this browser? Saves will be kept.')){await deleteCachedGame(name);await renderLibrary()}};actions.append(play,download,remove);row.append(title,actions);list.append(row)}
}
el('profile-file').onchange=async()=>{selectedProfile=null;el('profile-summary').textContent='';const file=el('profile-file').files[0];if(!file)return;try{status('Reading profile…');selectedProfile=await WebModBuilder.readProfile(file);el('profile-summary').textContent='Profile found: '+selectedProfile.manifest.mods.map(m=>m.name).join(' · ');status('Profile loaded. Select Balatro and build your version.')}catch(e){status(e.message,true)}};
el('build-form').onsubmit=async event=>{
 event.preventDefault();const game=el('game-file').files[0],name=el('version-name').value.trim();if(!game||!name)return;if(el('profile-file').files.length&&!selectedProfile){status('The profile has not loaded yet or is invalid.',true);return}if((await listCachedVersions()).includes(name)&&!confirm('Replace version “'+name+'”? Saves will be kept.'))return;
 const controls=[...el('build-form').querySelectorAll('input,button')];controls.forEach(x=>x.disabled=true);el('progress').hidden=false;
 try{const blob=await WebModBuilder.build(game,selectedProfile,(message,value)=>{status(message);el('progress').value=value});await saveGameToCache(blob,name);await renderLibrary();status('Version built! Click Play. Use Download to keep a backup.')}catch(e){console.error(e);status(e.message,true)}finally{controls.forEach(x=>x.disabled=false)}
};
el('ready-file').onchange=async()=>{const file=el('ready-file').files[0];if(!file)return;try{const zip=await JSZip.loadAsync(await file.arrayBuffer());if(!zip.file('main.lua')||!zip.file('web_patched'))throw Error('Choose a version already built by this site.');const name=file.name.replace(/\.(love|zip)$/i,'');if((await listCachedVersions()).includes(name)&&!confirm('Replace “'+name+'”?'))return;await saveGameToCache(file,name);await renderLibrary();status('Version imported.')}catch(e){status(e.message,true)}finally{el('ready-file').value=''}};
renderLibrary().catch(e=>status('Unable to open local storage: '+e.message,true));
