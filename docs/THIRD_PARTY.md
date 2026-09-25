# 资源与许可

## 开源代码

- Three.js r180 — https://github.com/mrdoob/three.js — MIT。包括 OrbitControls、GLTFExporter、RGBELoader、RoomEnvironment 与几何工具。许可原文在 `node_modules/three/LICENSE`，分发复制件在 `docs/licenses/three-MIT.txt`。
- Vite — https://github.com/vitejs/vite — MIT，构建工具。
- Playwright — https://github.com/microsoft/playwright — Apache-2.0，仅开发验收使用。
- Barlow Condensed — https://github.com/jpt/barlow — SIL Open Font License 1.1；由 @fontsource/barlow-condensed 提供。
- Manrope — https://github.com/sharanda/manrope — SIL Open Font License 1.1；由 @fontsource/manrope 提供。

字体随构建本地打包，无 Google Fonts 运行时请求。实际依赖版本锁定在 `package-lock.json`。

## 天空

- Kloppenheim 06 (Pure Sky)，Poly Haven：https://polyhaven.com/a/kloppenheim_06_puresky
- 2K Radiance HDR，文件 `public/environment/kloppenheim_06_puresky_2k.hdr`。
- 下载：https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_06_puresky_2k.hdr
- 授权：CC0；来源说明 https://polyhaven.com/license 。
- 用于环境天空与车辆反射。程序化天空保留为载入失败后的后备方案。

## 原创建模与声音

三款车的几何、车标、赛道、建筑、桥梁、植被图集、界面和引擎合成均在本项目制作；没有导入第三方品牌车辆或复制任何游戏资产。

中文播报使用当前 Windows 安装的 Microsoft Huihui Desktop 本地 TTS 生成。其语音引擎没有打包到项目；只保存生成的 WAV，并保留重建脚本。
