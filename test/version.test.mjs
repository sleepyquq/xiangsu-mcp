import test from 'node:test';
import assert from 'node:assert/strict';
import {auditedEditors,assessEditorCompatibility,selectEditorVersion,minimumEditorVersion,validationEditors} from '../src/version.mjs';
import {extracted} from '../src/catalog.mjs';

test('本版只接受适配基线及未来版本；旧像塑引导历史 MCP，不再以私有二进制哈希卡未来版本',()=>{
 assert.equal(minimumEditorVersion,'9.7.2');
 assert.deepEqual(validationEditors,['9.7.2']);
 for(const hash of [null,'different-binary',auditedEditors['9.4.1']])assert.deepEqual(assessEditorCompatibility('9.7.2',hash,extracted.sha256),{verified:true,minimumEditorVersion:'9.7.2',warning:null});
 for(const version of ['9.7.3','9.8.0','9.10.0','10.0.0']){
  const result=assessEditorCompatibility(version,null,extracted.sha256);
  assert.equal(result.verified,false);assert.match(result.warning,/允许安装/);
 }
 for(const version of ['9.3.2','9.4.0','9.4.1','9.5.2','9.6.0','9.7.0','9.7.1','8.9.9'])assert.throws(()=>assessEditorCompatibility(version,null,extracted.sha256),/VERSION_TOO_OLD.*历史 MCP/);
 for(const version of ['9.4.-1','unknown','9.7.2.1'])assert.throws(()=>assessEditorCompatibility(version,null,extracted.sha256),/VERSION_UNKNOWN/);
 assert.throws(()=>assessEditorCompatibility('9.7.2',null,'unknown'),/BASELINE_NOT_AUDITED/);
});

test('运行包热更新高于 EXE 时选择实际版本，磁盘更新待重启时不退回旧版本',()=>{
 assert.equal(selectEditorVersion('9.6.0.900323358',['9.6.1.909462442']).version,'9.6.1');
 assert.equal(selectEditorVersion('9.6.0.900323358',['9.6.1.909462442']).versionSource,'running-editor');
 assert.equal(selectEditorVersion('9.6.2.1',['9.6.1.909462442']).version,'9.6.2');
 assert.equal(selectEditorVersion('9.5.2.1').version,'9.5.2');
 assert.equal(selectEditorVersion('9.9.0.1',['9.10.0.2']).version,'9.10.0');
 assert.throws(()=>selectEditorVersion('unknown'),/EDITOR_VERSION_UNKNOWN/);
});
