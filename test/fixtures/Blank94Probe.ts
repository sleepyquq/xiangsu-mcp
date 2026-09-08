import {Game2D,Scene,Text} from './Game2D';
import {createPitchDetector,createVolumeDetector,AgentPitchDetector,AgentVolumeDetector} from './AgentAudioDetector';
import {registerKeywordDetectorInit,createKeywordDetector} from './AgentAudioKeyword';
registerKeywordDetectorInit({keywordType:'chineseWord'});

class ProbeScene extends Scene {
 frames=0;pitch=-1;volume=-1;hits=0;misses=0;lastKeyword='';touches=0;
 private pitchDetector:AgentPitchDetector|null=null;
 private volumeDetector:AgentVolumeDetector|null=null;
 private label:Text|null=null;
 create(){
  this.pitchDetector=createPitchDetector();this.volumeDetector=createVolumeDetector();
  const keyword=createKeywordDetector();
  keyword?.setTargetKeywords(['测试']);
  keyword?.onKeywordHit(words=>{this.hits++;this.lastKeyword=words.join(',');});
  keyword?.onKeywordMiss(()=>{this.misses++;});keyword?.start();
  this.input.on('pointerdown',()=>{this.touches++;});
  this.label=this.add.text(360,200,'等待测试',{template:'ProbeText',color:'#00ff00'});
 }
 update(){
  this.frames++;this.pitch=this.pitchDetector?.getPitchHz()??-1;this.volume=this.volumeDetector?.getVolume()??-1;
  this.label?.setText('Hz '+Math.round(this.pitch)+' 音量 '+this.volume.toFixed(2)+'\n命中 '+this.hits+' 未命中 '+this.misses+' 触摸 '+this.touches);
 }
}
@component()
export class Blank94Probe extends Game2D {
 @serializeProperty() probeTexture:APJS.Texture;
 @serializeProperty() probeMaterial:APJS.Material;
 textureBound=false;materialBound=false;
 onInit(){super.onInit();}
 onStart(){this.textureBound=!!this.probeTexture;this.materialBound=!!this.probeMaterial;this.startGame(ProbeScene);}
}
