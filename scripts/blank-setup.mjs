import {client,call,write,projectPath} from './blank-client.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
try{
 const scene=await call('sceneSpec');if(scene.objects.length)throw Error('要求空白工程，当前不为空');
 await call('sceneOps',{ops:[{op:'add',type:'Text',id:'ProbeText',content:'空白回归',positionMode:'absolute',x:360,y:200,width:700,height:180,fontSize:36,boxDimension:'fixedSize'}]});
 const g=await call('eh_addRenderGroup',{name:'MCP测试脚本',type:'Utility'});
 await call('eh_addSceneObject',{parent:g.guid.data,type:'Transform',name:'MCP测试脚本对象'});
 await write('Assets/Blank94Probe.ts',await fs.readFile(new URL('../test/fixtures/Blank94Probe.ts',import.meta.url),'utf8'));
 const params={scriptName:'Blank94Probe',targetId:'MCP测试脚本对象',abilities:['音高检测','音量检测','关键词检测']};
 await call('setupGameScript',params);
 await call('compileProject');
 const texturePath=path.join(projectPath,'Assets/MCPProbeTexture.png');
 await sharp({create:{width:64,height:64,channels:4,background:'#ff0000'}}).png().toFile(texturePath);
 await call('eh_addAsset',{path:texturePath});
 const materialPath=path.join(projectPath,'Assets/MCPProbeMaterial.omtl');
 const config=JSON.parse(await fs.readFile(new URL('../config.local.json',import.meta.url),'utf8'));
 await fs.copyFile(path.join(config.resourcesRoot,'../assets/material/Unlit.omtl'),materialPath);
 await call('eh_addAsset',{path:materialPath});
 const assets=await call('eh_getAllAssets');
 const asset=n=>assets.find(a=>a.name.data===n);
 const texture=asset('MCPProbeTexture'),material=asset('MCPProbeMaterial');
 if(!texture||!material)throw Error('资源未导入');
 const bound=await call('setupGameScript',{...params,resourceBindings:[{property:'probeTexture',type:'Texture',guid:texture.guid.data},{property:'probeMaterial',type:'Material',guid:material.guid.data}]});
 console.log(JSON.stringify(bound));
 await call('sceneSpec');await call('compileProject');
}finally{await client.close();}
