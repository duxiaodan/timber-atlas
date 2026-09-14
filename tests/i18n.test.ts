import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../src/model/catalog';
import {english,terminology} from '../src/i18n/english';
import {translate,currentLanguage,LANGUAGE_KEY} from '../src/i18n/locale';

const catalog=createCatalog();
test('reviewed translations cover every current component and assembly without mutating domain data',()=>{
 const before=JSON.stringify(catalog);
 const texts=new Set(catalog.parts.flatMap(p=>[p.name,p.kind,p.role,p.joint,p.evidence.basis,p.evidence.inferred]));
 for(const a of catalog.assemblies)for(const value of [a.name,a.description,a.location])if(value)texts.add(value);
 for(const s of catalog.sources)for(const value of [s.title,s.author,s.detail])texts.add(value);
 const missing=[...texts].filter(s=>/[\u3400-\u9fff]/.test(english(s)));
 assert.deepEqual(missing,[]);
 assert.equal(JSON.stringify(catalog),before);
 for(const kind of new Set(catalog.parts.map(p=>p.kind)))assert.ok(terminology[kind]?.pinyin,kind);
});
test('default locale leaves original Chinese unchanged and is independent of session storage',()=>{
 assert.equal(currentLanguage(),'zh-CN');assert.equal(translate('外檐柱头斗拱'),'外檐柱头斗拱');
 assert.equal(LANGUAGE_KEY,'sunmao-language');
});
test('dynamic translations preserve grid IDs, counts and evidence distinctions',()=>{
 assert.equal(english('外檐柱头斗拱 4—E'),'Outer column-head bracket set 4—E');
 assert.equal(english('当前显示 22,369 件'),'Showing 22,369 components');
 assert.equal(english('第 2 / 4 步 · 整理构件'),'Step 2 / 4 · Prepare components');
 assert.equal(english('内槽转角斗拱 7—D · 第二正向第4层柱头枋'),'Inner corner bracket set 7—D · Column-head tie on the second orthogonal axis, tier 4');
 assert.match(english('火珠在模型中的安装位置下调0.30米，该定位为推定；宽厚、背面人物、未见面、局部浮雕和隐藏支承仍为照片近似或推定，未取得完整实测。'),/0\.30 m.*inferred.*without a complete measured survey/);
 assert.match(english('双杪双下昂七铺作，第一与第三外跳偷心。'),/seven-puzuo/);
 assert.match(english('柱脚承于柱础，柱顶以榫与栌斗/阑额节点定位。柱头榫尺寸为推定。'),/architrave.*inferred/);
});
