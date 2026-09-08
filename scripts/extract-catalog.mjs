// 只解析官方 JavaScript 的 AST；不 eval、不执行安装包内代码。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseExpressionAt} from 'acorn';
import {fileURLToPath} from 'node:url';
const binary=process.argv[2] || path.join(process.env.LOCALAPPDATA,'Douyin AR/Resources/agent-server.exe');
const bytes=fs.readFileSync(binary);
const source=bytes.toString('utf8');
const marker=source.match(/(?:var\s+EHCommandRegisterList\s*=\s*)\[/);
const start=marker?marker.index+marker[0].lastIndexOf('['):source.indexOf('[{commandType:"getScene",description:');
if(start<0) throw Error('官方命令表特征已变化，请重新审计');
const tree=parseExpressionAt(source.slice(start,start+150000),0,{ecmaVersion:'latest'});
const unknown=new Set();
const resolving=new Set();
function resolveId(name) {
 if(resolving.has(name))return null;
 const re=new RegExp('(?:var\\s+|[;,\\n]\\s*)'+name.replace(/[$]/g,'\\$')+'\\s*=\\s*','g');
 const matches=[...source.matchAll(re)];
 for(const m of matches){try{return parseExpressionAt(source.slice(m.index+m[0].length,m.index+m[0].length+150000),0,{ecmaVersion:'latest'});}catch{}}
 return null;
}
function literal(n) {
 if(!n)return undefined;
 if(n.type==='Literal') return n.value;
 if(n.type==='Identifier'){const v=resolveId(n.name);if(v&&v.type!=='Identifier')return literal(v);return undefined;}
 if(n.type==='ArrayExpression') return n.elements.map(literal);
 if(n.type==='ObjectExpression') return Object.fromEntries(n.properties.map(p=>[p.key.name??p.key.value,literal(p.value)]));
 if(n.type==='UnaryExpression' && n.operator==='-')return -literal(n.argument);
 if(n.type==='BinaryExpression'&&n.operator==='+') return String(literal(n.left)??'')+String(literal(n.right)??'');
 if(n.type==='TemplateLiteral')return n.quasis.map(q=>q.value.cooked).join('');
 if(n.type==='CallExpression' && n.callee.name==='gn')return ' '+(literal(n.arguments[0])??'');
 if(n.type==='CallExpression' && n.callee.property?.name==='join')return literal(n.callee.object)?.join(literal(n.arguments[0])??',');
 return undefined;
}
function schema(n) {
 if(n?.type==='SequenceExpression')return schema(n.expressions[0]);
 if(n?.type==='Identifier'){
  const v=resolveId(n.name);
  if(v){resolving.add(n.name);const r=schema(v);resolving.delete(n.name);return r;}
 }
 if(n?.type!=='CallExpression'){unknown.add(n?.name??n?.type);return {};}
 if(['Wte','getSetAPIValueParams'].includes(n.callee.name))return {type:'object',properties:{data:{},type:{type:'string'}},required:['data','type'],additionalProperties:false};
 if(n.callee.name==='createCropRectSchema')return {type:'object',properties:{left:{type:'integer',minimum:0},top:{type:'integer',minimum:0},width:{type:'integer',minimum:1},height:{type:'integer',minimum:1}},required:['left','top','width','height'],additionalProperties:false};
 const method=n.callee.property?.name;
 const args=n.arguments;
 if(method==='preprocess'){unknown.add('preprocess');return schema(args.at(-1));}
 if(n.callee.object?.type==='Identifier') {
  if(['string','number','boolean'].includes(method))return {type:method};
  if(['any','unknown'].includes(method))return {};
  if(method==='object') {
   const props={},req=[];
   for(const p of args[0].properties){const key=p.key.name??p.key.value;const v=schema(p.value);if(!v._optional)req.push(key);delete v._optional;props[key]=v;}
   return {type:'object',properties:props,required:req,additionalProperties:false};
  }
  if(method==='array')return {type:'array',items:schema(args[0])};
  if(method==='enum')return {type:'string',enum:literal(args[0])};
  if(method==='literal')return {const:literal(args[0])};
  if(method==='union')return {anyOf:args[0].elements.map(schema)};
  if(method==='discriminatedUnion')return {anyOf:args[1].elements.map(schema)};
  if(method==='record')return {type:'object',additionalProperties:schema(args.at(-1))};
 }
 const base=schema(n.callee.object);
 if(method==='extend'&&args[0]?.type==='ObjectExpression'){
  for(const p of args[0].properties){const k=p.key.name??p.key.value,v=schema(p.value);if(!v._optional)(base.required??=[]).push(k);delete v._optional;(base.properties??={})[k]=v;}return base;
 }
 if(method==='describe'){base.description=literal(args[0])??'';return base;}
 if(method==='optional'||method==='default'){base._optional=true;if(method==='default')base.default=literal(args[0]);return base;}
 if(method==='nullable')return {anyOf:[base,{type:'null'}]};
 if(method==='min'||method==='max'){base[base.type==='string'?(method==='min'?'minLength':'maxLength'):base.type==='array'?(method==='min'?'minItems':'maxItems'):(method==='min'?'minimum':'maximum')]=literal(args[0]);return base;}
 if(method==='int'){base.type='integer';return base;}
 if(method==='passthrough'){base.additionalProperties=true;return base;}
 if(method==='strict'||method==='trim')return base;
 if(['superRefine','refine','regex'].includes(method)){unknown.add(method);return base;}
 if(method==='positive'){base.exclusiveMinimum=0;return base;}
 if(method==='nonnegative'){base.minimum=0;return base;}
 if(method==='length'){const k=base.type==='array'?'Items':'Length';base['min'+k]=literal(args[0]);base['max'+k]=literal(args[0]);return base;}
 unknown.add(method??n.callee.name??'unknown');return base;
}
const commands=tree.elements.map(e=>{
 const p=Object.fromEntries(e.properties.map(p=>[p.key.name,p.value]));
 const inputSchema=schema(p.params);
 return {name:literal(p.commandType),description:literal(p.description),inputSchema,parameterOrder:Object.keys(inputSchema.properties??{}),source:'official-command-schema',runtimeVerified:false};
});
const toolMatches=[...source.matchAll(/name\s*=\s*"([A-Za-z][A-Za-z0-9_]*)";\s*description\s*=\s*/g)];
const topTools=toolMatches.map(m=>{
 const name=m[1],p=m.index;
 const desc=parseExpressionAt(source.slice(p+m[0].length,p+100000),0,{ecmaVersion:'latest'});
 const sm=/;\s*schema\s*=\s*/.exec(source.slice(p,p+100000));
 let inputSchema=null;
 try {if(sm)inputSchema=schema(parseExpressionAt(source.slice(p+sm.index+sm[0].length,p+sm.index+sm[0].length+150000),0,{ecmaVersion:'latest'}));}catch(e){unknown.add(name+':'+e.message);}
 return {name,description:literal(desc),inputSchema};
});
const out={sourceBinary:binary,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),extractedAt:new Date().toISOString(),unknownSchemaConstructs:[...unknown],commands,topTools};
// 默认只产出候选文件，审核完成后由维护者显式更新正式清单。
const output=process.argv[3]??new URL('../.local/catalog.candidate.json',import.meta.url);
fs.mkdirSync(path.dirname(output instanceof URL?fileURLToPath(output):output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(out,null,2));
console.log(JSON.stringify({commands:commands.length,topTools:topTools.map(t=>t.name),unknown:[...unknown]}));
