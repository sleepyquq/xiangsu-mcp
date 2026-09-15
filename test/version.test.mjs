import test from 'node:test';
import assert from 'node:assert/strict';
import {auditedEditors,assertEditorCompatibility} from '../src/version.mjs';
import {extracted} from '../src/catalog.mjs';

test('安装仅接受已审计版本与对应包，拒绝交叉版本、未知包和未经审计的清单基线',()=>{
 for(const [version,hash] of Object.entries(auditedEditors))assert.doesNotThrow(()=>assertEditorCompatibility(version,hash,extracted.sha256));
 assert.throws(()=>assertEditorCompatibility('9.4.2',auditedEditors['9.4.1'],extracted.sha256),/VERSION_NOT_AUDITED/);
 assert.throws(()=>assertEditorCompatibility('9.4.1',auditedEditors['9.4.0'],extracted.sha256),/SOURCE_MISMATCH/);
 assert.throws(()=>assertEditorCompatibility('9.4.1','unknown',extracted.sha256),/SOURCE_MISMATCH/);
 assert.throws(()=>assertEditorCompatibility('9.4.1',auditedEditors['9.4.1'],'unknown'),/BASELINE_NOT_AUDITED/);
});
