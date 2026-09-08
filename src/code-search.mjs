import ts from 'typescript';
import fs from 'node:fs/promises';
import path from 'node:path';
import {walk,checkedPath} from './files.mjs';
// 使用 TypeScript 语义符号查询，不调用官方私有 CKG 服务。
export async function codeSearch(p,c){
 if(p.mode!=='structure'&&!p.symbol)throw Error('definition/references 必须提供 symbol');
 const root=checkedPath('Assets',c.projectPath),files=(await walk(root)).filter(f=>/\.[jt]s$/.test(f));
 const target=p.file_path?checkedPath(p.file_path,c.projectPath):null;
 const texts=new Map(await Promise.all(files.map(async f=>[path.resolve(f),await fs.readFile(f,'utf8')])));
 const options={noEmit:true,noResolve:true,noLib:true,allowJs:true,experimentalDecorators:true,target:ts.ScriptTarget.Latest};
 const host={...ts.createCompilerHost(options),fileExists:f=>texts.has(path.resolve(f)),readFile:f=>texts.get(path.resolve(f)),getSourceFile:(f,v)=>texts.has(path.resolve(f))?ts.createSourceFile(f,texts.get(path.resolve(f)),v,true):undefined,writeFile:()=>{}};
 const program=ts.createProgram(files,options,host),checker=program.getTypeChecker(),hits=[],symbols=new Set(),nodes=[];
 const row=(sf,n)=>{const pos=sf.getLineAndCharacterOfPosition(n.getStart(sf));return {file:path.relative(c.projectPath,sf.fileName).replaceAll('\\','/'),line:pos.line+1,column:pos.character+1,name:n.getText(sf),kind:ts.SyntaxKind[n.parent.kind]};};
 for(const sf of program.getSourceFiles()){
  function visit(n){
   if(ts.isIdentifier(n)){
    nodes.push([sf,n]);const declaration=n.parent.name===n;
    if((!target||path.resolve(sf.fileName)===target)&&((p.mode==='structure'&&declaration)||n.text===p.symbol)){
     if(p.mode==='structure')hits.push(row(sf,n));
     else {const sym=checker.getSymbolAtLocation(n);if(sym)symbols.add(sym);}
    }
   }
   ts.forEachChild(n,visit);
  }visit(sf);
 }
 if(p.mode==='definition')for(const sym of symbols)for(const decl of sym.declarations??[])hits.push(row(decl.getSourceFile(),decl.name??decl));
 if(p.mode==='references')for(const [sf,n]of nodes)if(symbols.has(checker.getSymbolAtLocation(n)))hits.push(row(sf,n));
 return {matches:hits.slice(0,500),total:hits.length,truncated:hits.length>500,engine:'typescript-6.0.3',limitations:'仅索引工程 Assets 中源码；不包含官方运行时生成代码或私有 CKG 索引。'};
}
