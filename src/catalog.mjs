import fs from 'node:fs';
export const extracted=JSON.parse(fs.readFileSync(new URL('../catalog.generated.json',import.meta.url),'utf8'));
export const str={type:'string'}, num={type:'number'}, bool={type:'boolean'}, any={};
export const obj=(properties={},required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const arr=items=>({type:'array',items});
const top=name=>extracted.topTools.find(t=>t.name===name)?.inputSchema;
const bindings=arr(obj({property:{...str,minLength:1},type:{enum:['Texture','Material']},guid:{...str,minLength:1}}));
// 保留 9.3 客户端入口；新版正式入口使用 setupGameScript。
extracted.topTools.push({name:'userScript',description:'兼容旧版脚本初始化/依赖同步/资源绑定；新任务优先 setupGameScript',inputSchema:obj({action:{enum:['init','ensureDeps','bindProperties']},scriptName:str,targetId:str,abilities:arr(str),componentProperties:bindings},[])});
const extra=[];
function add(name,inputSchema,description,parameterOrder=Object.keys(inputSchema.properties??{})) {extra.push({name,inputSchema,description,parameterOrder,source:'audited-official-callsite',runtimeVerified:false});}
add('echo',obj({message:str}),'连接回声测试');
add('getConsoleLogs',obj({startLine:{type:'integer',minimum:1},count:{type:'integer',minimum:1,maximum:1000}},[]),'获取运行日志',['startLine','count']);
add('getGanCatalog',obj(),'获取官方 GAN 预设目录');
add('getFfmpegPath',obj(),'获取内置 ffmpeg 路径');
add('applySceneOps',obj({ops:arr({type:'object',properties:{op:{enum:['add','modify','remove']},id:str,guid:str,type:str,target:{enum:['object','group']},groupId:str,visible:bool,transform:obj({position:obj({x:num,y:num}),size:obj({width:num,height:num})},[]),image:obj({textureKey:str,drawMode:str,alpha:{type:'number',minimum:0,maximum:1}},[]),text:{type:'object'},audio:{type:'object'},postProcess:{type:'object'},general:{type:'object'},extensions:{type:'object'}},required:['op'],additionalProperties:false})},['ops']),'原生嵌套场景 DSL；平铺坐标和样式请使用 sceneOps');
add('attachUserScript',obj({targetId:str,scriptName:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]*$'},componentProperties:top('userScript').properties.componentProperties},['scriptName']),'挂载已经存在的用户脚本',['targetId','scriptName','componentProperties']);
add('runOtscCheck',obj({projectPath:str,options:obj({timeoutMs:num,maxOutputChars:num},[])},[]),'调用官方 TypeScript 编译检查',['projectPath','options']);
for(const [operation,name,order] of [['create','createMaterialAsset',['operation','assetName','omtlContent']],['edit','editMaterialAsset',['operation','guid','omtlContent']],['read','readMaterialAsset',['operation','guid','assetPath']],['get_compile_status','getMaterialCompileStatus',['operation','guid']]]){
 const s=structuredClone(top('materialAsset').anyOf.find(s=>s.properties.operation.const===operation));
 s.required=s.required.filter(k=>k!=='operation');s.properties.operation.default=operation;
 add(name,s,'官方材质接口：'+operation,order);
}
add('ensureImageAssetsReady',obj({projectPath:str,assetPaths:arr(str)},['assetPaths']),'等待图片资源就绪',['projectPath','assetPaths']);
add('saveScreenshot',obj({scale:{type:'number',exclusiveMinimum:0,maximum:2},path:str},[]),'截图返回 MCP image；可选路径限定在当前工程');
const coordinate={type:'number',minimum:0,maximum:1};
for(const name of ['previewTouch','previewTouchDown','previewTouchUp','previewTouchMove'])add(name,obj({x:coordinate,y:coordinate}),'预览触摸交互；x/y 为 [0,1] 归一化坐标');
add('previewDrag',obj({x1:coordinate,y1:coordinate,x2:coordinate,y2:coordinate,steps:{type:'integer',minimum:1,maximum:200},durationMs:{type:'number',minimum:0,maximum:30000}},['x1','y1','x2','y2']),'预览拖拽；起止坐标为 [0,1]');
add('wait',obj({ms:{type:'number',minimum:0,maximum:30000}}),'等待预览时间');
for(const name of ['reloadSticker','startPreviewRecord','stopPreviewRecord','pausePreview','resumePreview'])add(name,obj(),'预览控制：'+name);
add('recordPreviewVideo',obj({path:str,durationSeconds:{type:'number',exclusiveMinimum:0,maximum:60}},[]),'录制预览视频，输出路径限定在当前工程');
add('transportPreviewProperty',obj({sceneObjectGuid:str,componentType:str,property:str,value:any}),'向预览运行时传递属性');
add('createProjectSnapshot',obj({conversationId:str,projectPath:str,gitRef:str},['gitRef']),'创建官方工程快照');
add('restoreProjectSnapshot',obj({conversationId:str,projectPath:str,commitId:str,gitRepoPath:str},['commitId','gitRepoPath']),'恢复工程快照；不会修改官方 Agent 聊天历史');
add('deleteProjectSnapshotRefs',obj({conversationId:str,gitRefs:arr(str),gitRepoPath:str},['gitRefs','gitRepoPath']),'删除指定官方快照引用');
const priorVerified=new Set(['echo','getScene','getRenderGroup','setRenderGroup','getAllAssets','getConsoleLogs','getSceneObject','setSceneObject','getComponent','setComponent','saveScreenshot','runOtscCheck','pausePreview','resumePreview']);
const readOnly=new Set(['echo','getScene','getConsoleLogs','getGanCatalog','getFfmpegPath','getRenderGroup','getSupportedRenderGroupType','getSceneObject','getComponent','getSupportedComponentTypes','getAllAssets','getAsset','getBuiltinAssetFiles','readMaterialAsset','getMaterialCompileStatus']);
add('getHumanActions',obj(),'9.4：枚举可用人脸、手势和全身动作');
add('switchHumanAction',obj({actionId:{...str,minLength:1}}),'9.4：切换动作，使用枚举返回的精确 actionId');
add('setPlayAudioInput',obj({id:str,input:{...obj({pitchHz:{type:'number',minimum:45,maximum:650},volume:{type:'number',minimum:0,maximum:1},keywordEvent:{anyOf:[obj({type:{const:'hit'},keywords:{type:'array',items:{...str,minLength:1},minItems:1}}),obj({type:{const:'miss'}})]}},[]),minProperties:1},durationMs:{type:'number',minimum:1,maximum:30000}}),'9.4：注入模拟音频；必须在 finally 清除');
add('clearPlayAudioInput',obj(),'9.4：清除模拟音频');
add('beginPreviewRecording',obj({filePath:str,projectPath:str,playId:{type:'string',pattern:'^[a-f0-9-]{36}$'}},['filePath']),'9.4：开始预览视频录制',['filePath','projectPath']);
for(const name of ['endPreviewRecording','abortPreviewRecording'])add(name,obj(),'9.4：结束/中止预览视频录制');
readOnly.add('getHumanActions');
export const commands=[...extracted.commands,...extra].map(c=>({...c,readOnly:readOnly.has(c.name),runtimeVerified:false,verification:priorVerified.has(c.name)?{editorVersion:'9.3.2',status:'historical'}:{status:'not-verified'},schemaStatus:'mapped'}));
// 未确认参数的入口明确禁用，不把猜测模式当成可用能力。
export const byName=new Map(commands.map(c=>[c.name,c]));
export const previewNames={screenshot:'saveScreenshot',touch:'previewTouch',touch_down:'previewTouchDown',touch_up:'previewTouchUp',touch_move:'previewTouchMove',drag:'previewDrag',wait:'wait',reset_preview:'reloadSticker',start_preview_record:'startPreviewRecord',stop_preview_record:'stopPreviewRecord',record_preview_video_mp4:'recordPreviewVideo',pause_preview:'pausePreview',resume_preview:'resumePreview',transport_preview_property:'transportPreviewProperty'};
