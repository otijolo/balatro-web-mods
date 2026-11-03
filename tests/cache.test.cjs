const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cache.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const state={closed:0,created:[],operations:[]};
 const db={
  objectStoreNames:{contains:()=>false},
  close(){state.closed++},
  createObjectStore(name){state.created.push(name)},
  transaction(name,mode){
   assert.equal(name,'cache');state.mode=mode;
   const store={};
   for(const op of ['get','put','delete','getAllKeys'])store[op]=(...args)=>{
    state.operations.push([op,args]);return state.request={};
   };
   return state.tx={objectStore:()=>store,abort(){this.onabort?.()}};
  }
 };
 const context=vm.createContext({indexedDB:{open(name,version){
  assert.equal(name,'BalatroCacheDB');assert.equal(version,1);
  const req=state.open={result:db};queueMicrotask(()=>req.onsuccess?.());return req;
 }},Error});
 vm.runInContext(source,context);
 state.context=context;state.db=db;
 return state;
}
(async()=>{
 for(const [fn,args,op,result,expected] of [
  ['loadCachedGame',['mods'],'get',{test:true},{test:true}],
  ['loadCachedGame',[],'get',undefined,null],
  ['saveGameToCache',[{blob:true},'mods'],'put','mods',undefined],
  ['deleteCachedGame',['mods'],'delete',undefined,undefined],
  ['listCachedVersions',[],'getAllKeys',['a','b'],['a','b']]
 ]){
  const s=fixture();let settled=false;
  const promise=s.context[fn](...args).then(value=>{settled=true;return value});
  await flush();assert.equal(s.operations[0][0],op);
  s.request.result=result;s.request.onsuccess();await flush();
  assert.equal(settled,false,fn+' must wait for transaction completion');
  assert.equal(s.closed,0);
  s.tx.oncomplete();assert.deepEqual(await promise,expected);assert.equal(s.closed,1);
 }
 for(const fn of ['loadCachedGame','saveGameToCache','deleteCachedGame','listCachedVersions']){
  const s=fixture();const promise=s.context[fn]();const rejection=assert.rejects(promise,/request failed/);
  await flush();s.request.error=new Error('request failed');s.request.onerror();s.tx.onerror();s.tx.onabort();
  await rejection;assert.equal(s.closed,1);
 }
 {
  const s=fixture();const promise=s.context.saveGameToCache({},'mods');const rejection=assert.rejects(promise,/quota exceeded/);
  await flush();s.request.result='mods';s.request.onsuccess();s.tx.error=new Error('quota exceeded');s.tx.onabort();
  await rejection;assert.equal(s.closed,1);
 }
 {
  const s=fixture();const promise=s.context.openGameDB();s.open.onupgradeneeded();
  await promise;assert.deepEqual(s.created,['cache']);s.db.onversionchange();assert.equal(s.closed,1);
 }
 {
  const s=fixture();const promise=s.context.openGameDB();const rejection=assert.rejects(promise,/other tabs/);
  s.open.onblocked();await rejection;await flush();assert.equal(s.closed,1,'late open must close after blocked rejection');
 }
 {
  const s=fixture();const promise=s.context.cacheTransaction('readonly',()=>{throw new Error('invalid operation')});
  await assert.rejects(promise,/invalid operation/);assert.equal(s.closed,1,'throwing operation must close only once');
 }
 console.log('PASS cache tests: reads/writes wait for commit, request errors, late quota abort, upgrade, version change, blocked cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
