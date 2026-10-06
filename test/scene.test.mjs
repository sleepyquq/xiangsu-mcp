import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneOps,sceneSpec,normalizeOps} from '../src/scene.mjs';
const field=data=>({data});
function fixture(){
 const node={guid:field('text-guid'),name:field('Label'),visible:field(true),components:[{guid:field('transform'),type:field('ScreenTransform'),anchors:field({x:0,y:0,z:1,w:1}),offsets:field({x:100,y:300,z:-140,w:-100})},{guid:field('text'),type:field('Text2D'),input:field('原文字'),fontSize:field(24)}]};
 return {renderGroups:[{guid:field('group'),name:field('UI'),enabled:field(true),sceneObjects:[node]}]};
}
test('场景实时投影、原生嵌套参数和连续修改读回',async()=>{
 const live=fixture(),calls=[];
 const c={call:async(name,p)=>{
  calls.push({name,p});if(name==='getScene')return live;if(name==='getAllAssets')return [];
  assert.equal(name,'applySceneOps');const op=p.ops[0];assert.equal(op.text.content,'新文字');assert.equal(op.content,undefined);
  const n=live.renderGroups[0].sceneObjects[0];n.components[1].input.data=op.text.content;return {success:true};
 }};
 const spec=await sceneSpec(c);assert.equal(spec.objects.find(o=>o.id==='Label').x,200);assert.equal(spec.objects.find(o=>o.id==='Label').y,120);
 const r=await sceneOps({ops:[{op:'modify',id:'Label',content:'新文字'},{op:'modify',id:'Label',content:'新文字'}]},c);
 assert.equal(r.success,true);assert.equal(r.results.length,2);
 assert.throws(()=>normalizeOps([{op:'modify',id:'Label',positionMode:'absolute',x:20,dy:10}],spec.objects,[]),/CONFLICT/);
});
test('编辑器宣称成功但字段没有生效时，上层必须失败',async()=>{
 const c={call:async name=>name==='getScene'?fixture():name==='getAllAssets'?[]:{success:true}};
 const result=await sceneOps({ops:[{op:'modify',id:'Label',content:'未生效'}]},c);
 assert.equal(result.success,false);assert.equal(result.results[0].verification.errors[0].field,'content');
});
test('同批未通过预检，不应先写入前面的操作',async()=>{
 let writes=0;const c={call:async name=>name==='getScene'?fixture():name==='getAllAssets'?[]:(writes++,{success:true})};
 await assert.rejects(()=>sceneOps({ops:[{op:'modify',id:'Label',content:'修改'},{op:'add',id:'Image',type:'Image'}]},c),/textureKey/);assert.equal(writes,0);
});
test('9.4 原生 DSL 忽略文字枚举时通过组件设置并规范化读回',async()=>{
 const live=fixture(),text=live.renderGroups[0].sceneObjects[0].components[1];
 text.boxDimension=field('Dynamic');text.horizontalAlignment=field('CENTER');
 const c={call:async(name,p)=>{
  if(name==='getScene')return live;if(name==='getAllAssets')return [];
  if(name==='setComponent'){assert.equal(p.guid,'text');for(const item of p.properties){assert.equal(item.value.type,'Enum');text[item.property]=field(item.value.data);}}
  return {success:true};
 }};
 const result=await sceneOps({ops:[{op:'modify',id:'Label',boxDimension:'fixedSize',horizontalAlignment:'left'}]},c);
 assert.equal(result.success,true);assert.equal(text.boxDimension.data,'FixedSize');assert.equal(text.horizontalAlignment.data,'LEFT');
});
test('子目录图片按资源 GUID 和 Texture 字段类型绑定',async()=>{
 const live=fixture(),node=live.renderGroups[0].sceneObjects[0];
 node.components[1]={type:field('Image'),guid:field('image-component'),texture:field({guid:'old'})};
 const assets=[{name:field('nested'),guid:field('new'),type:field('Texture2D')}];
 const c={call:async(name,p)=>{
  if(name==='getScene')return live;if(name==='getAllAssets')return assets;
  if(name==='setComponent'){assert.equal(p.properties[0].value.type,'Texture');node.components[1].texture=field(p.properties[0].value.data);}
  if(name==='applySceneOps')assert.equal(p.ops[0].image.textureKey,undefined);
  return {success:true};
 }};
 const result=await sceneOps({ops:[{op:'modify',id:'Label',textureKey:'nested'}]},c);
 assert.equal(result.success,true);assert.equal(result.results[0].object.texture.guid,'new');
});
test('文字显式尺寸必须配合 fixedSize/fixedWidth，dynamic 预检拒绝且不写入',async()=>{
 let writes=0;const c={call:async name=>name==='getScene'?fixture():name==='getAllAssets'?[]:(writes++,{success:true})};
 await assert.rejects(()=>sceneOps({ops:[{op:'modify',id:'Label',content:'先改'},{op:'add',type:'Text',id:'T',groupId:'UI',content:'x',positionMode:'absolute',x:100,y:100,width:200,height:50}]},c),/TEXT_SIZE_REQUIRES_FIXED_BOX/);
 assert.equal(writes,0);
 const objects=(await sceneSpec(c)).objects;
 assert.doesNotThrow(()=>normalizeOps([{op:'add',type:'Text',id:'T',groupId:'UI',content:'x',positionMode:'absolute',x:100,y:100,width:200,height:50,boxDimension:'fixedSize'}],objects,[]));
 assert.doesNotThrow(()=>normalizeOps([{op:'add',type:'Text',id:'T',groupId:'UI',content:'x',positionMode:'absolute',x:100,y:100}],objects,[]));
});
test('fixedWidth 文字只核对宽度，高度随内容变化不算失败且标记未验证',async()=>{
 const live=fixture(),node=live.renderGroups[0].sceneObjects[0],[transform,text]=node.components;
 const c={call:async(name,p)=>{
  if(name==='getScene')return live;if(name==='getAllAssets')return [];
  if(name==='applySceneOps'){assert.deepEqual(p.ops[0].transform.size,{width:300,height:999});transform.offsets.data={...transform.offsets.data,y:400};}
  if(name==='setComponent')for(const item of p.properties)text[item.property]=field(item.value.data);
  return {success:true};
 }};
 const result=await sceneOps({ops:[{op:'modify',id:'Label',boxDimension:'fixedWidth',width:300,height:999}]},c);
 assert.equal(result.success,true);assert.equal(result.results[0].object.width,300);assert.equal(result.results[0].object.height,40);
 assert.ok(result.results[0].verification.verifiedFields.includes('width'));assert.ok(!result.results[0].verification.verifiedFields.includes('height'));
 assert.ok(result.results[0].verification.unverifiedFields.includes('height'));
 text.boxDimension=field('Dynamic');
 await assert.rejects(()=>sceneOps({ops:[{op:'modify',id:'Label',width:300,height:40}]},c),/TEXT_SIZE_REQUIRES_FIXED_BOX/);
});
test('9.5 layoutMode 映射、组件写入和后续尺寸预检使用同一文字模式',async()=>{
 const live=fixture(),text=live.renderGroups[0].sceneObjects[0].components[1];
 text.layoutMode=field('AutoSize');
 const c={call:async(name,p)=>{
  if(name==='getScene')return live;if(name==='getAllAssets')return [];
  if(name==='getComponent')return text;
  if(name==='setComponent'){
   assert.equal(p.properties[0].property,'layoutMode');
   text.layoutMode=field(p.properties[0].value.data);
  }
  return {success:true};
 }};
 assert.equal((await sceneSpec(c)).objects[1].style.boxDimension,'dynamic');
 const result=await sceneOps({ops:[{op:'modify',id:'Label',boxDimension:'fixedWidth'}]},c);
 assert.equal(result.success,true);assert.equal(text.layoutMode.data,'AutoHeight');
 const spec=await sceneSpec(c);
 assert.equal(spec.objects[1].style.boxDimension,'fixedWidth');
 assert.doesNotThrow(()=>normalizeOps([{op:'modify',id:'Label',width:300}],spec.objects,[]));
 text.layoutMode=field('AutoWidth');
 const autoWidth=(await sceneSpec(c)).objects;
 assert.throws(()=>normalizeOps([{op:'modify',id:'Label',width:300}],autoWidth,[]),/TEXT_SIZE_REQUIRES_FIXED_BOX/);
});
test('同批文字尺寸预检沿用前一步框模式，切回 dynamic 后整批拒绝且不写入',async()=>{
 const add={op:'add',type:'Text',id:'T',content:'文字',positionMode:'absolute',x:100,y:100,width:200,height:50,boxDimension:'fixedSize'};
 const plans=normalizeOps([add,{op:'modify',id:'T',width:300}],[],[]);
 assert.equal(plans[1].textBox,'fixedSize');
 assert.deepEqual(plans[1].native.transform.size,{width:300,height:50});
 const live=fixture(),text=live.renderGroups[0].sceneObjects[0].components[1];text.boxDimension=field('FixedSize');
 let writes=0;const c={call:async name=>name==='getScene'?live:name==='getAllAssets'?[]:(writes++,{success:true})};
 await assert.rejects(()=>sceneOps({ops:[{op:'modify',id:'Label',boxDimension:'dynamic'},{op:'modify',id:'Label',width:300}]},c),/TEXT_SIZE_REQUIRES_FIXED_BOX/);
 assert.equal(writes,0);
 const objects=(await sceneSpec(c)).objects;
 objects.find(o=>o.id==='Label').style.boxDimension='dynamic';
 assert.equal(normalizeOps([{op:'modify',id:'Label',boxDimension:'fixedWidth'},{op:'modify',id:'Label',width:300}],objects,[])[1].textBox,'fixedWidth');
});
