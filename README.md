# QQ空间相册备份助手

Edge / Chrome Manifest V3 扩展：输入相册地址，在已登录的浏览器中直接下载照片到本机，无需预览。照片不上传到服务器。

## 原项目与许可证

本项目基于 **[withwz/qq-zone-assistant](https://github.com/withwz/qq-zone-assistant)**，保留原项目提交历史、原作者署名 `Copyright (c) 2024 wz` 和 [MIT许可证](LICENSE)。本仓库由 determine123 整理发布改进版，不是腾讯官方产品。

原项目采用ZIP打包；本版增加独立管理页、浏览器直接下载、暂停重试、成功记录、分页兼容及脱敏结构诊断。当前入口是 `src/manager.html`；旧版脚本保留作来源参考。

## 安装使用

1. 下载仓库ZIP并解压，或克隆本仓库。
2. 打开 `edge://extensions/` 或 `chrome://extensions/`，开启开发者模式。
3. 点击「加载解压缩的扩展」，选择含 `manifest.json` 的目录。
4. 在同一浏览器手动登录QQ空间，点击扩展图标打开管理页。
5. 输入 `https://user.qzone.qq.com/账号/photo/相册ID/`，点击「直接下载」。最多张数留空表示全部。
6. 保持管理页打开。需要重新读取接口时，在目标相册刷新，再点击「继续 / 重试」。

照片存到浏览器下载目录的 `QQ空间备份/账号/相册目录/`。已记录成功的照片会跳过；删除本机照片不会自动清除成功记录。「已处理」不等于完整下载，请核对照片清单、编号与失败记录。

## 排除规则和诊断

排除相册名称可在管理页逐行填写。公开版默认规则为空，没有内置个人账号或相册名单，也不会覆盖原安装中的已有设置。

可导出照片清单；未知接口格式会停止，并尝试自动导出脱敏结构诊断。不要公开浏览器存储中的原始请求地址，它可能包含会话授权参数。

## 权限与局限

- `downloads`用于保存照片，`storage`保存本机设置、进度和会话请求，`webRequest`读取相册接口地址。网络范围限定为 `https://*.qzone.qq.com/*`。
- 用户手动登录，不接收密码，不绕过访问权限；只备份自己或获授权访问的相册。
- QQ接口可能变化；不承诺所有账号、特殊相册或视频可下载。异常分页不会当作成功。
- 浏览器关闭、休眠、网络中断会影响下载。本次发布为源码开源，不是浏览器商店上架。

## 开发验证

无需构建，Node.js 22+ 运行核心测试：

```sh
node --test tests/core.test.cjs
```

浏览器模拟测试需要Playwright及Chromium：

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/direct-download-smoke.cjs
node tests/repeated-page-smoke.cjs
```

可用 `PLAYWRIGHT_MODULE`、`BROWSER_EXECUTABLE` 指定本机运行时。自动测试使用虚构账号和模拟接口，不等于真实QQ账号全量下载验证。
