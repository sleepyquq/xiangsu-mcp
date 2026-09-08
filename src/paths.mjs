// 代码目录与特效工程目录独立，迁移代码不能改变测试和写入目标。
import fs from 'node:fs';
export function effectWorkspace(){
 const config=JSON.parse(fs.readFileSync(new URL('../config.local.json',import.meta.url),'utf8'));
 const root=process.env.XIANGSU_EFFECT_WORKSPACE??config.effectWorkspace;
 if(!root)throw Error('请先在 config.local.json 配置 effectWorkspace');
 return root;
}
