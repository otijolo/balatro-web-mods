const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context={luaparse:require('../lib/luaparse.js')};context.globalThis=context;
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../comparison-opt.js'),'utf8'),context);
const optimize=s=>context.WebComparisonOptimizer.optimize('return '+s).slice(7);
for(const input of ['__web_compare("==",(a or b),nil)','__web_compare("~=",f(),"x")','__web_compare("==",__web_compare("~=",x,nil),true)','__web_compare("<",#items,5)']){
 const output=optimize(input);assert.notEqual(output,input);context.luaparse.parse('return '+output,{luaVersion:'5.1'});assert.equal(optimize(output),output);
}
for(const input of ['__web_compare("==",score,0)','__web_compare("<",score,5)','__web_compare("==",a,b)','__web_compare("<=",x,"a")'])assert.equal(optimize(input),input);
assert.equal(optimize('__web_compare("==",(a or b),nil)'), '((a or b) == (nil))');
console.log('PASS comparison optimizer: precedence, nested calls, idempotence and numeric guards');
const method='function Node:remove() return __web_compare("==",v,self) end';
const objectOptimize=s=>context.WebComparisonOptimizer.optimize(s,{objectMethods:true});
assert(!objectOptimize(method).includes('__web_compare'));
assert(context.WebComparisonOptimizer.optimize(method).includes('__web_compare'));
for(const source of [
 'function Big:eq() return __web_compare("==",v,self) end',
 'function Node:remove() local self=1; return __web_compare("==",v,self) end',
 'function Node:remove() self=1; return __web_compare("==",v,self) end',
 'function Node:remove() return function(self) return __web_compare("==",v,self) end end',
 'function Node:remove() return __web_compare("<",v,self) end',
 'function Node:remove() return __web_compare("==",self.score,0) end'
])assert(objectOptimize(source).includes('__web_compare'),source);
assert.equal(objectOptimize(objectOptimize(method)),objectOptimize(method));
console.log('PASS object comparisons: opt-in, method scope, shadowing, numeric fields and ordering guards');
