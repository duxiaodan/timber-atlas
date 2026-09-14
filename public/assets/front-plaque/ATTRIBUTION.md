# Plaque image and lettering / 匾额图像与文字

## Photograph and adaptation / 照片与改编

- Photographer / 摄影：**Patrick20242023**, 2024-05-30.
- Source / 来源：[佛光寺东大殿佛光真容禅寺匾额](https://commons.wikimedia.org/wiki/File:佛光寺东大殿佛光真容禅寺匾额.jpg).
- License / 许可：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

`photo.jpg` is the Commons-generated 1280 px thumbnail, with no further raster editing. The application maps portions of this photograph onto a modeled plaque frame and recessed panel. The rear uses a plain timber region of the photograph as an inferred surface. The image-mapping adaptation and traced-outline geometry are offered under CC BY-SA 4.0.

`photo.jpg` 为 Commons 生成的 1280 像素缩略图，未作额外位图编辑。应用将照片局部映射到匾框和内凹板面，背面取照片中的素木区域作为推定表面。图像映射改编与描摹轮廓几何按 CC BY-SA 4.0 提供。

The geometry in `src/model/front-plaque.ts` and `src/model/front-plaque-solid.ts` uses the traced silhouette. Dimensions, thickness, curvature, mounting and hidden rear details are inferred. The photo-free geometry adds modeled relief and lettering to that silhouette and retains the same CC BY-SA 4.0 terms.

`src/model/front-plaque.ts` 与 `src/model/front-plaque-solid.ts` 中的几何使用描摹轮廓。尺寸、厚度、曲率、悬挂方式及隐藏背面细节为推定。不使用照片贴图的几何在该轮廓上添加浮雕与文字，继续适用 CC BY-SA 4.0 条款。

The oblique photograph [5檐下1.jpg](https://commons.wikimedia.org/wiki/File:5檐下1.jpg) by **Haier7917** (2012, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)) provides a reference for form. Its pixels are not used in the model texture.

**Haier7917** 的斜侧照片 [5檐下1.jpg](https://commons.wikimedia.org/wiki/File:5檐下1.jpg)（2012，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)）用于形体参考，其像素未用于模型贴图。

## Font-derived geometry / 字体衍生几何

Letter meshes use six glyph outlines from **LXGW WenKai Regular**, under **SIL Open Font License 1.1**. See the [font project](https://github.com/lxgw/LxgwWenKai), [full license](font-OFL.txt) and [provenance](font-source.json). The lettering approximates the inscription with a contemporary typeface.

文字网格使用 **霞鹜文楷 Regular** 的六字轮廓，采用 **SIL Open Font License 1.1** 许可，见 [字体项目](https://github.com/lxgw/LxgwWenKai)、[完整许可](font-OFL.txt) 和 [来源记录](font-source.json)。文字以现代字体近似表达匾额题字。
