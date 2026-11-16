/* Remove compatibility calls only when operand types prove native comparison safe. */
(function(root){
function primitive(n){
 if(!n)return null;
 if(['StringLiteral','BooleanLiteral','NilLiteral'].includes(n.type))return n.type;
 if(n.type==='NumericLiteral'||(n.type==='UnaryExpression'&&n.operator==='#'))return 'number';
 return null;
}
function safe(op,a,b){
 const x=primitive(a),y=primitive(b);
 if(op==='=='||op==='~=')return [x,y].some(t=>t&&t!=='number')||x==='number'&&y==='number';
 return x==='number'&&y==='number';
}
function optimize(source){
 const ast=root.luaparse.parse(source,{luaVersion:'5.2',ranges:true,comments:false});
 const edits=[];
 function walk(n){
  if(!n||typeof n!=='object')return;
  if(n.type==='CallExpression'&&n.base.type==='Identifier'&&n.base.name==='__web_compare'&&n.arguments.length===3){
   const [op,a,b]=n.arguments;
   const operator=source.slice(op.range[0]+1,op.range[1]-1);
   if(safe(operator,a,b)){
    edits.push([n.range[0],a.range[0],'(('],[a.range[1],b.range[0],') '+operator+' ('],[b.range[1],n.range[1],'))']);
   }
  }
  for(const [key,value] of Object.entries(n)){if(key==='range')continue;if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value)}
 }
 walk(ast);edits.sort((a,b)=>b[0]-a[0]);
 for(const [a,b,text] of edits)source=source.slice(0,a)+text+source.slice(b);
 return source;
}
root.WebComparisonOptimizer={optimize,safe};
})(globalThis);
