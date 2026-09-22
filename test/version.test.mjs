import test from 'node:test';
import assert from 'node:assert/strict';
import {auditedEditors,assessEditorCompatibility} from '../src/version.mjs';
import {extracted} from '../src/catalog.mjs';

test('实测编辑器正常安装；未知版本或官方包只提示，清单基线损坏仍拒绝',()=>{
 for(const [version,hash] of Object.entries(auditedEditors))assert.deepEqual(assessEditorCompatibility(version,hash,extracted.sha256),{verified:true,warning:null});
 for(const result of [
  assessEditorCompatibility('9.4.2',auditedEditors['9.4.1'],extracted.sha256),
  assessEditorCompatibility('9.4.1',auditedEditors['9.4.0'],extracted.sha256),
  assessEditorCompatibility('9.4.1',null,extracted.sha256),
 ]){assert.equal(result.verified,false);assert.match(result.warning,/自行验证/);}
 for(const oldVersion of ['9.3.2','8.9.9','9.4.-1'])assert.throws(()=>assessEditorCompatibility(oldVersion,null,extracted.sha256),/VERSION_TOO_OLD/);
 assert.throws(()=>assessEditorCompatibility('9.4.1',auditedEditors['9.4.1'],'unknown'),/BASELINE_NOT_AUDITED/);
});
