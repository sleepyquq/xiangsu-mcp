// 上层 DSL 与编辑器原生命令并非同一模式；只转换本机已审计的字段。
const value = x => x?.data ?? x;
const typeOf = node => ({Text2D:'Text',Image:'Image',Audio:'Audio'})[node.components?.map(c=>value(c.type)).find(t=>['Text2D','Image','Audio'].includes(t))] ?? 'General';
const component = (node,type) => node.components?.find(c=>value(c.type)===type);
const pick = (o,keys) => Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const colorHex = c => c ? '#'+['r','g','b'].map(k=>Math.round(c[k]*255).toString(16).padStart(2,'0')).join('') : undefined;
const lowerFirst = x => typeof x==='string'?x[0].toLowerCase()+x.slice(1):x;

export function projectScene(scene,assets=[]){
 if(!Array.isArray(scene?.renderGroups))throw Error('GET_SCENE_FAILED: 编辑器未返回有效场景');
 const objects=[];
 function visit(node,parent={x:360,y:640,width:720,height:1280},groupId,ancestorsVisible=true,geometrySafe=true,isGroup=false){
  const name=value(node.name),guid=value(node.guid),st=component(node,'ScreenTransform');
  let bounds;
  const scale=value(st?.scale??st?.localScale),rotation=value(st?.rotation??st?.eulerAngle);
  geometrySafe=geometrySafe&&(!scale||Object.values(scale).every(x=>x===1))&&(!rotation||(typeof rotation==='number'?rotation===0:Object.values(rotation).every(x=>x===0)));
  // 基于实际父级矩形和锚点计算。没有变换的相机/渲染组沿用画布。
  if(st){
   const anchors=value(st.anchors),offsets=value(st.offsets);
   if(anchors&&offsets){
    const left=parent.x-parent.width/2+anchors.x*parent.width+offsets.x;
    const right=parent.x-parent.width/2+anchors.y*parent.width+offsets.y;
    const bottom=parent.y+parent.height/2-anchors.z*parent.height-offsets.z;
    const top=parent.y+parent.height/2-anchors.w*parent.height-offsets.w;
    bounds={x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top};
   }
  }
  const visible=value(node.visible)??value(node.enabled)??true;
  if(isGroup||st||node.components?.length){
   const image=component(node,'Image'),text=component(node,'Text2D');
   const textureGuid=value(image?.texture)?.guid,asset=assets.find(a=>value(a.guid)===textureGuid);
   objects.push({id:name,guid,type:typeOf(node),target:isGroup?'group':'object',groupId,visible,effectiveVisible:ancestorsVisible&&visible,...(geometrySafe?bounds:{}),
    ...(image?{texture:{guid:textureGuid,key:value(asset?.name)},color:colorHex(value(image.color)),alpha:value(image.color)?.a,drawMode:value(image.drawMode)}:{}),
    ...(text?{text:value(text.input),style:{fontSize:value(text.fontSize),color:colorHex(value(text.color)),boxDimension:lowerFirst(value(text.boxDimension)),horizontalAlignment:value(text.horizontalAlignment)?.toLowerCase(),verticalAlignment:value(text.verticalAlignment)?.toLowerCase()}}:{}),
    physics2d:{components:(node.components??[]).filter(c=>['RigidBody2D','CircleCollider2D','BoxCollider2D','PolygonCollider2D','EdgeCollider2D'].includes(value(c.type)))},
    componentIds:Object.fromEntries((node.components??[]).map(c=>[value(c.type),value(c.guid)])),
    geometrySource:bounds&&geometrySafe?'live-screen-transform':undefined});
  }
  const nextGroup=st&&!component(node,'Image')&&!component(node,'Text2D')?name:groupId;
  for(const child of node.sceneObjects??node.children??[])visit(child,bounds??parent,nextGroup,ancestorsVisible&&visible,geometrySafe);
 }
 for(const group of scene.renderGroups)visit(group,undefined,value(group.name),true,true,true);
 return objects;
}

function resolve(objects,op,required=true){
 const found=objects.filter(o=>op.guid?o.guid===op.guid:o.id===op.id);
 if(found.length>1)throw Error(`AMBIGUOUS_NAME: ${op.id} 重名，请指定 guid`);
 if(required&&!found.length)throw Error(`NOT_FOUND: ${op.id??op.guid}`);
 return found[0];
}

export function normalizeOps(ops,objects,assets){
 const predicted=[...objects],plans=[];
 for(const input of ops){
  const op={...input};
  if(op.target==='group'){
   if(op.op!=='modify'||!op.groupId||typeof op.visible!=='boolean')throw Error('group 操作仅支持指定 groupId/visible 的 modify');
   plans.push({native:pick(op,['op','target','groupId','visible']),input:op});continue;
  }
  if(!op.id?.trim()&&!op.guid)throw Error('对象操作必须指定非空 id 或 guid');
  const current=resolve(predicted,op,op.op!=='add');
  op.id??=current?.id;
  if(op.textContainerId)throw Error('TEXT_CONTAINER_NOT_ADAPTED: 请显式提供文字位置和尺寸');
  if((op.positionMode||op.width!==undefined||op.height!==undefined)&&current&&!current.geometrySource)throw Error('GEOMETRY_UNVERIFIED: 当前对象变换无法可靠投影，请用组件接口');
  const positionFields={absolute:['x','y'],relative:['dx','dy'],pinned:['left','right','top','bottom']};
  if(op.positionMode&&Object.entries(positionFields).some(([mode,keys])=>mode!==op.positionMode&&keys.some(k=>op[k]!==undefined)))throw Error('POSITION_MODE_CONFLICT: 不可混合不同位置模式');
  if(op.op==='add'&&current)throw Error(`ALREADY_EXISTS: ${op.id}`);
  const type=op.type??current?.type;
  if(!type)throw Error('新增对象必须指定 type');
  const native={op:op.op,id:op.id,type,...pick(op,['groupId','visible','extensions','general'])};
  if(current?.guid)native.guid=current.guid;
  const expected={...current,id:op.id,type,...pick(op,['groupId','visible'])};
  if(op.op!=='remove'){
   const transform={};
   if(op.width!==undefined||op.height!==undefined){
    const width=op.width??current?.width,height=op.height??current?.height;
    if(!(width>0&&height>0))throw Error(`${op.id}: 尺寸必须为正；新建时提供完整 width/height`);
    transform.size={width,height};Object.assign(expected,transform.size);
   }
   if(op.positionMode){
    let x,y;
    if(op.positionMode==='absolute'){x=op.x??current?.x;y=op.y??current?.y;}
    else if(op.positionMode==='relative'){
     if(!current?.geometrySource)throw Error(`${op.id}: 没有可用于相对移动的实时矩形`);
     x=current.x+(op.dx??0);y=current.y+(op.dy??0);
    }else if(op.positionMode==='pinned'){
     const w=expected.width,h=expected.height;
     if(!w||!h||(op.left===undefined)===(op.right===undefined)||(op.top===undefined)===(op.bottom===undefined))throw Error(`${op.id}: pinned 需要完整尺寸和各一个水平/垂直边距`);
     x=op.left!==undefined?op.left+w/2:720-op.right-w/2;
     y=op.top!==undefined?op.top+h/2:1280-op.bottom-h/2;
    }else throw Error('无效 positionMode');
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error(`${op.id}: 缺少位置坐标`);
    transform.position={x,y};Object.assign(expected,{x,y});
   }else if(['x','y','left','right','top','bottom','dx','dy'].some(k=>op[k]!==undefined))throw Error('设置坐标必须指定 positionMode');
   if(Object.keys(transform).length)native.transform=transform;
   if(type==='Image'){
    if(op.op==='add'&&!op.textureKey)throw Error('新增 Image 必须指定 textureKey');
    if(op.op==='add'&&!op.groupId)throw Error('新增 Image 必须指定 sceneSpec 返回的 groupId');
    if(op.op==='add')resolve(predicted,{id:op.groupId});
    const image=pick(op,['textureKey','drawMode','alpha']);
    if(op.textureKey){
     const matches=assets.filter(a=>[value(a.name),String(value(a.name)).replace(/\.[^.]+$/,'')].includes(op.textureKey)&&String(value(a.type)).startsWith('Texture'));
     if(matches.length!==1)throw Error(`ASSET_NOT_UNIQUE_OR_READY: ${op.textureKey}，先导入并确认唯一素材`);
     image.textureKey=String(value(matches[0].name)).replace(/\.[^.]+$/,'');expected.texture={key:image.textureKey,guid:value(matches[0].guid)};
    }
    if(Object.keys(image).length)native.image=image;
    if(op.color!==undefined&&!/^#[\da-f]{6}$/i.test(op.color))throw Error('Image color 使用 #RRGGBB');
   }else if(type==='Text'){
    const style=pick(op,['fontSize','color','shadow','stroke','boxDimension','lineBreakType','horizontalAlignment','verticalAlignment','lineSpacing']);
    native.text={...(op.content!==undefined?{content:op.content}:{}),...(Object.keys(style).length?{style}:{})};
   }else if(type==='Audio'){
    native.audio=pick(op,['clip','isBgm']);
    if(op.clip&&!/\.[a-z0-9]+$/i.test(op.clip))native.audio.clip=op.clip+'.mp3';
   }else if(type==='PostProcess')native.postProcess=pick(op,['componentGuid','effectType','materialGuid']);
  }
  const index=predicted.indexOf(current);
  if(!current&&['x','y','width','height'].every(k=>Number.isFinite(expected[k])))expected.geometrySource='planned-screen-transform';
  if(op.op==='remove')predicted.splice(index,1);else if(current)predicted[index]=expected;else predicted.push(expected);
  plans.push({native,input:op,expected});
 }
 return plans;
}

export async function sceneSpec(c){
 const scene=await c.call('getScene',{}),assets=await c.call('getAllAssets',{});
 return {objects:projectScene(scene?.renderGroups?scene:scene?.result,Array.isArray(assets)?assets:assets?.assets??assets?.result??[]),source:'live-editor',canvas:{width:720,height:1280,coordinateSystem:'official-design-canvas'},adapterNotes:'实时对象和组件；使用官方 720×1280 设计坐标，不是屏幕像素。复杂旋转/缩放时不提供未经验证的几何。'};
}

export async function sceneOps(p,c){
 const before=await sceneSpec(c),raw=await c.call('getAllAssets',{}),assets=Array.isArray(raw)?raw:raw.assets??raw.result??[];
 // 整批先校验，再逐项执行、读回，避免第二次修改同一对象时误验证中间状态。
 normalizeOps(p.ops,before.objects,assets);
 const results=[];
 for(const [index,input]of p.ops.entries()){
  let wrote=false;
  try{
   const state=await sceneSpec(c),[plan]=normalizeOps([input],state.objects,assets);
   const {native,expected}=plan;
   wrote=true;
   // 原生图片 DSL 按文件名查找时会漏掉子目录素材；已解析的资源直接按 GUID 绑定。
   if(native.type==='Image'&&input.op==='add'){
    const parent=resolve(state.objects,{id:input.groupId});
    const made=await c.call('addSceneObject',{parent:parent.guid,type:'ScreenTransform',name:input.id});
    if(made?.success===false)throw Error('IMAGE_CREATE_FAILED: '+JSON.stringify(made));
    const fresh=await sceneSpec(c),object=resolve(fresh.objects,{id:input.id});
    const added=await c.call('addComponent',{sceneObject:object.guid,type:'Image'});
    if(added?.success===false)throw Error('IMAGE_COMPONENT_FAILED: '+JSON.stringify(added));
    native.op='modify';native.guid=object.guid;
   }
   if(native.type==='Image'&&input.textureKey){
    const fresh=await sceneSpec(c),object=resolve(fresh.objects,native);
    const bound=await c.call('setComponent',{guid:object.componentIds.Image,properties:[{property:'texture',value:{type:'Texture',data:{guid:expected.texture.guid}}}]});
    if(bound?.success===false)throw Error('IMAGE_TEXTURE_FAILED: '+JSON.stringify(bound));
    delete native.image.textureKey;
   }
   const result=await c.call('applySceneOps',{ops:[native]});
   if(result?.success!==true)throw Error('EDITOR_APPLY_FAILED: '+JSON.stringify(result));
   let after=await sceneSpec(c);
   // 9.4 applySceneOps 会静默忽略部分文字枚举；用实测组件枚举写入并继续读回。
   if(native.type==='Text'&&input.op!=='remove'){
    const properties=[];
    for(const key of ['boxDimension','horizontalAlignment','verticalAlignment'])if(input[key]!==undefined){
     const data=key==='boxDimension'?input[key][0].toUpperCase()+input[key].slice(1):input[key].toUpperCase();
     properties.push({property:key,value:{type:'Enum',data}});
    }
    if(properties.length){
     const object=resolve(after.objects,native);
     const changed=await c.call('setComponent',{guid:object.componentIds.Text2D,properties});
     if(changed?.success===false)throw Error('TEXT_STYLE_FAILED: '+JSON.stringify(changed));
     after=await sceneSpec(c);
    }
   }
   if(native.type==='Image'&&input.color!==undefined&&input.op!=='remove'){
    const object=resolve(after.objects,native),hex=input.color;
    const colored=await c.call('setComponent',{guid:object.componentIds.Image,properties:[{property:'color',value:{type:'Color',data:{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255,a:input.alpha??object.alpha??1}}}]});
    if(colored?.success===false)throw Error('IMAGE_COLOR_FAILED: '+JSON.stringify(colored));
    after=await sceneSpec(c);
   }
   const actual=input.target==='group'?resolve(after.objects,{id:input.groupId}):resolve(after.objects,native,false);
   const errors=[],verifiedFields=[];
   const check=(field,want,got,tolerance=0)=>{verifiedFields.push(field);if(tolerance?(!Number.isFinite(got)||Math.abs(got-want)>tolerance):JSON.stringify(got)!==JSON.stringify(want))errors.push({field,expected:want,actual:got});};
   if(input.op==='remove')check('removed',false,!!actual);
   else{
    check('exists',true,!!actual);
    if(actual){
     for(const key of ['x','y'])if(native.transform?.position)check(key,expected[key],actual[key],0.5);
     for(const key of ['width','height'])if(native.transform?.size)check(key,expected[key],actual[key],0.5);
     if(input.textureKey)check('texture',expected.texture.guid,actual.texture?.guid);
     if(input.content!==undefined)check('content',input.content,actual.text);
     if(input.visible!==undefined)check('visible',input.visible,actual.visible);
     if(input.color!==undefined)check('color',input.color.toLowerCase(),actual.color??actual.style?.color);
     if(input.alpha!==undefined)check('alpha',input.alpha,actual.alpha,0.005);
     if(input.drawMode!==undefined)check('drawMode',input.drawMode,actual.drawMode);
     for(const key of ['fontSize','boxDimension','horizontalAlignment','verticalAlignment'])if(input[key]!==undefined)check(key,input[key],actual.style?.[key]);
    }
   }
   const unverifiedFields=Object.keys(input).filter(k=>['extensions','general','clip','isBgm','componentGuid','effectType','materialGuid','shadow','stroke','lineBreakType','lineSpacing','groupId'].includes(k)&&!(k==='groupId'&&input.target==='group'));
   results.push({index,success:errors.length===0,result,verification:{success:errors.length===0,verifiedFields,unverifiedFields,errors},object:actual});
   if(errors.length)return {success:false,applied:results.length,results,failedIndex:index,retrySafe:false};
  }catch(error){
   let live;try{live=await sceneSpec(c);}catch{}
   return {success:false,applied:results.length,results,failedIndex:index,error:String(error),mayHaveApplied:wrote,retrySafe:!wrote&&results.length===0,liveScene:live};
  }
 }
 return {success:true,applied:results.length,results,adapterNotes:'逐项转换并读回；unverifiedFields 需专项组件/预览验证。不是原子事务，失败不自动重试。'};
}
