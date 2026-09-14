import type { Source } from './types';

export const sources: Source[] = [
  {"id":"roof-vase-photo2024","title":"佛光寺东大殿左侧面 · 角梁下宝瓶","author":"Patrick20242023 · 2024-05-23 · CC BY-SA 4.0","url":"https://commons.wikimedia.org/wiki/File:佛光寺东大殿左侧面.jpg","detail":"现场侧照用于核对瘦长瓶身、棱面、束腰和分层底座。仅作形体参考，未作贴图；尺寸及隐藏连接未测绘。"},
  {"id":"roof-terminal-photo2023","title":"纵贯山西大地 饱览三晋古韵（九）· 戗脊与走兽","author":"启敬 · 文内行程日期2023-09-16","url":"https://gs.ctrip.com/html5/you/travels/100056/4126311.html","detail":"采用“戗脊与走兽”照片右上方垂脊端兽的轮廓、卷纹与浅色外观；未采用游记的历史判断。照片只作形体参考，未用作贴图；厚度、背面及固定方式未测绘。"},
  {id:'roof-user-scan2026',title:'佛光寺东大殿 · 三维参考',author:'康托耶夫 · Sketchfab',url:'https://sketchfab.com/3d-models/e53f77f9e2ae41c28caef01e29dd9c65',detail:'公开嵌入页核实标题与作者；截图显示垂脊端部降阶。未下载或测量原网格，未将此模型认定为正式测绘成果。'},
  {id:'roof-eave-photo2017',title:'佛光寺东大殿：来自大唐的使者 · 檐角龙头照片',author:'墨色山西 · 2017-12-13署名现场游记',url:'https://www.sohu.com/a/210296651_100010743',detail:'采用“檐角的龙头”和“脊兽和风铃”现场照片核对檐角形体；未采用文中的建筑年代判断。照片仅供形体研究，未作为贴图。'},
  {id:'front-plaque-side2012',title:'佛光寺东大殿檐下匾额斜侧照片',author:'Haier7917 · 2012 · CC BY-SA 3.0',url:'https://commons.wikimedia.org/wiki/File:5檐下1.jpg',detail:'实物斜侧摄影用于核对悬挂姿态和边框翻卷，仅作形体参考；此照片未用作模型贴图。15°倾角及具体曲面进深为推定。'},
  {id:'plaque-lettering',title:'LXGW WenKai · 霞鹜文楷',author:'LXGW / Fontworks · SIL OFL 1.1',url:'https://github.com/lxgw/LxgwWenKai',detail:'用于匾额六字轮廓的现代字体近似，未复刻实物书法。字体许可随资产保存。'},
  {id:'front-plaque2024',title:'佛光寺东大殿佛光真容禅寺匾额 · 现场照片',author:'Patrick20242023 · 2024-05-30 · CC BY-SA 4.0',url:'https://commons.wikimedia.org/wiki/File:佛光寺东大殿佛光真容禅寺匾额.jpg',detail:'采用原作者照片的Commons缩略图，通过模型UV映射呈现正面题字和框纹；实体轮廓、厚度、背面和挂接为推定。照片及其映射改编按CC BY-SA 4.0使用；许可 https://creativecommons.org/licenses/by-sa/4.0/ 。未核实具体制作年代。'},
  {id:'yingxian-joints2022',title:'营造尺和材分制：应县木塔五层木构表里数据采集与试解',author:'李泽辉、李大卫、刘畅 · 建筑史学刊 2022(1):36–53',url:'https://www.thepaper.cn/newsDetail_forward_17580348',detail:'期刊官方转载，§3.3、图17记录泥道栱与散斗间的隐藏栽销；其他斗位做法不同。对象为应县木塔，只供连接类型比较，不能证明东大殿具体斗底做法。'},
  {id:'qi2021',title:'五台佛光寺东大殿翼角构造之新解',author:'祁伟成 · 古建园林技术 2021(2)，21–25页',url:'http://www.gjyljs.com/gjyl/article/abstract/202115305',detail:'出版方核实篇目，正文通过署名论文转载查阅；作者结合复勘与模型修正提出翼角构造解释，隐蔽节点仍含推断，未作为实物拆解实测。'},
  {id:'statue-photos2024',title:'东大殿五尊主像现场摄影与像设研究',author:'Patrick20242023，2024；张荣等，清源文化遗产，2018',url:'https://www.sohu.com/a/245734528_170361',detail:'勘察团队的像设研究与现场照片，结合2024年五主像自摄照片核对姿态、冠服与现存重妆色调；程序使用独立曲面和顶点颜色，没有直接使用照片纹理。'},
  {id:'chcc2018',title:'佛光寺东大殿木构彩画及栱眼壁勘察',author:'清源文化遗产勘察团队，2018',url:'https://www.sohu.com/a/245954832_170361',detail:'现场记录栱眼壁、斗耳泥、木构白缘道和彩画残留。产品仅据图定位，未复制照片纹理。'},
  {id:'gongyan2026',title:'佛光寺东大殿壁画绘制年代建置沿革研究',author:'张荣等，2026',url:'https://skytyz.dha.ac.cn/CN/10.20182/j.cnki.ISSN2097-1370.202601008',detail:'记录14幅栱眼壁画，结合墙体地仗测年与颜料分析；本模型未复刻绘画。'},
  { id: 'dpm2007', title: '佛光寺东大殿实测数据解读', author: '张荣、刘畅、臧春雨 · 故宫博物院院刊 2007(2)', url: 'https://www.dpm.org.cn/building/talk/224453.html', detail: '2004—2006 年手测与激光扫描研究，为结构尺度与构造提供依据；原文可通过本条资料链接查阅。' },
  { id: 'zhang2022', title: '东大殿建筑数字化勘察数据分析与唐代材分营造法式研究', author: '张荣 · 韩国建筑历史学会 2022 年讲座', url: 'https://www.kaah.or.kr/download/mailing/kaah_seminar_presentation1_1.pdf', detail: '材份约21 mm，中五间各5.04 m、稍间及进深各4.41 m。采用正文231分总举方案；局部现存变形未逐件复刻。' },
  { id: 'liang1937', title: '记五台山佛光寺的建筑', author: '梁思成 · 1937 年调查（建筑史学刊转载）', url: 'https://www.thepaper.cn/newsDetail_forward_13478440', detail: '历史调查中的柱网、斗拱与梁架记录。用于核对构造，不能单独证明今日保存状态。' },
  { id: 'cao2005', title: 'A computer model for Chinese traditional timber structure: the Foguang Temple', author: 'Dapeng Cao · University of Adelaide, 2005', url: 'https://digital.library.adelaide.edu.au/items/93341fe9-2e75-48bf-aa76-085add129a93', detail: '逐构件与连接关系的计算机建模研究，用于交叉核对组件层级和装配表达。' },
  { id: 'isprs2021', title: 'Foguang Temple digital documentation and visualisation', author: 'ISPRS Archives · 2021', url: 'https://doi.org/10.5194/isprs-archives-XLVI-M-1-2021-395-2021', detail: '东大殿数字测绘与三维可视化研究；成果模型未作为可下载分件资产提供。' },
  { id: 'finial-photo2026', title: '佛光寺东大殿鸱吻现场细部摄影', author: 'Mortonstyle · 2026-04-04', url: 'https://www.sina.cn/news/detail/5283934164226668.html', detail: '现场近照用于核对吻头、小龙、青绿与黄釉、分缝和残损。照片仅作研究参考，未作为模型贴图或随程序再分发；深度与不可见背面仍属推定。' },
  { id: 'finial-publisher', title: '《神话遇见古建筑》：佛光寺鸱尾', author: '天津凤凰空间 · 杨建威摄影', url: 'https://www.thepaper.cn/newsDetail_forward_33543746', detail: '出版方发布的现场照片用于核对整体残尖轮廓及色彩。应用使用自主编写的几何；实物改装年代继续保留不确定性。' },
];
