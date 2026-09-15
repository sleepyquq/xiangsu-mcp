// 在 blank-setup 后执行场景与编译回归；只使用显式指定的测试副本，不保存场景。
import {client,call,projectPath,evidence} from './blank-client.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const imageId='MCP兼容回归图片';
const report={startedAt:new Date().toISOString(),checks:[]};
let original,modified;
try{
 const initial=await call('sceneSpec');
 original=initial.objects.find(o=>o.id==='ProbeText');
 assert.ok(original,'请先执行 blank-setup');
 assert.ok(!initial.objects.some(o=>o.id===imageId),'测试对象已存在，请检查上轮清理');
 modified=true;
 await call('sceneOps',{ops:[{op:'modify',id:'ProbeText',content:'MCP 9.4.1 回归通过',color:'#00ff00',horizontalAlignment:'center',boxDimension:'fixedSize',positionMode:'absolute',x:360,y:220,width:680,height:160}]});
 let text=(await call('sceneSpec')).objects.find(o=>o.id==='ProbeText');
 assert.equal(text.text,'MCP 9.4.1 回归通过');assert.equal(text.style.color,'#00ff00');
 assert.equal(text.style.horizontalAlignment,'center');assert.equal(text.style.boxDimension,'fixedSize');
 assert.deepEqual([text.x,text.y,text.width,text.height],[360,220,680,160]);
 await call('sceneOps',{ops:[{op:'modify',id:'ProbeText',positionMode:'relative',dx:10,dy:20,visible:false}]});
 text=(await call('sceneSpec')).objects.find(o=>o.id==='ProbeText');
 assert.equal(text.visible,false);assert.deepEqual([text.x,text.y],[370,240]);
 await call('sceneOps',{ops:[{op:'modify',id:'ProbeText',visible:true}]});
 report.checks.push('文字内容、颜色、枚举、绝对/相对坐标、显隐读回');
 // 子目录贴图使用实际资源 GUID，避免仅根目录名称匹配通过。
 const assetPath=path.join(projectPath,'Assets/MCPRegression941/SubTexture941.png');
 await fs.mkdir(path.dirname(assetPath),{recursive:true});
 await fs.copyFile(path.join(projectPath,'Assets/MCPProbeTexture.png'),assetPath);
 await call('eh_addAsset',{path:assetPath});
 const assets=await call('eh_getAllAssets'),texture=assets.find(a=>a.name.data==='SubTexture941');
 assert.ok(texture);
 await call('sceneOps',{ops:[{op:'add',id:imageId,type:'Image',groupId:original.groupId,textureKey:'SubTexture941',positionMode:'absolute',x:360,y:640,width:180,height:180,color:'#ff0000',alpha:0.6}]});
 const image=(await call('sceneSpec')).objects.find(o=>o.id===imageId);
 assert.equal(image.texture.guid,texture.guid.data);assert.equal(image.color,'#ff0000');assert.ok(Math.abs(image.alpha-0.6)<0.001);
 assert.deepEqual([image.x,image.y,image.width,image.height],[360,640,180,180]);
 const screenshot=await call('eh_saveScreenshot',{path:path.join(evidence,'scene-9.4.1.png'),scale:0.5});
 report.screenshot=screenshot;report.checks.push('子目录图片导入、GUID 绑定、颜色/透明度/布局、真实截图落盘');
 await call('eh_getConsoleLogs',{startLine:1,count:5});
 const actions=await call('playHumanActions');report.actions=actions;
 const script=await call('project_read_file',{path:'Assets/Blank94Probe.ts'});
 const bad=await call('project_write_file',{path:script.path,text:script.text+'\nconst mcpIntentionalError: number = "intentional type error";\n',expectedSha256:script.sha256});
 try{await assert.rejects(()=>call('compileProject'),/2322|not assignable/);}finally{
  await call('project_write_file',{path:script.path,text:script.text,expectedSha256:bad.sha256});
 }
 await call('compileProject');report.checks.push('故意类型错误被拒绝、源码恢复后编译通过');
 report.success=true;
}finally{
 try{
  if(modified){
   const scene=await call('sceneSpec'),image=scene.objects.find(o=>o.id===imageId);
   if(image)await call('eh_deleteSceneObject',{guid:image.guid});
   await call('sceneOps',{ops:[{op:'modify',id:'ProbeText',content:original.text,color:original.style.color,visible:original.visible,positionMode:'absolute',x:original.x,y:original.y,width:original.width,height:original.height,boxDimension:original.style.boxDimension,horizontalAlignment:original.style.horizontalAlignment}]});
   const restored=(await call('sceneSpec')).objects.find(o=>o.id==='ProbeText');assert.equal(restored.text,original.text);assert.equal(restored.visible,original.visible);
  }
  report.cleanup=true;
 }finally{
  await fs.writeFile(path.join(evidence,'scene-check-9.4.1.json'),JSON.stringify(report,null,2));
  await client.close();
 }
}
console.log('BLANK SCENE/CHECK VERIFIED');
