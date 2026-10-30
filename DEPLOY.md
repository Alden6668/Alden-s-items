# 把拾页部署成独立 App

目标：部署到公网 HTTPS，让 iPhone、Android、Mac、Windows 都通过同一个网址安装使用，不再依赖运行服务的电脑。

拾页是一个 **PWA + Node 服务**：

- 静态界面可以安装到桌面/主屏幕；
- AI 讨论、在线搜书、Edge 自然人声仍然需要后端，所以不能只放一个静态网页；
- 本项目自带 `Dockerfile` 和 `render.yaml`，推荐部署到 Render（免费版即可开始）。

## 方案一：Render + GitHub（推荐）

### 0. 准备

- 一个 GitHub 账号；
- 一个 Render 账号（可以用 GitHub 登录）。

### 1. 把项目上传到 GitHub

1. 在 GitHub 新建一个仓库，例如 `shiye-app`；
2. 把本项目文件夹里的所有文件上传到仓库根目录；
3. 确认仓库根目录能看到：
   - `Dockerfile`
   - `render.yaml`
   - `server.mjs`
   - `index.html`
   - `js/`、`css/`、`assets/`

> GitHub 网页上传时，请确认 `render.yaml`、`Dockerfile`、`package.json` 都上传了；`.dockerignore` 不是必需的（Dockerfile 会自动删除 macOS 的 vendor）。  
> 如果不会用 Git，可以直接在 GitHub 网页里用 “Add file → Upload files” 拖入整个项目。

也可以用终端推送。项目已经是一个本地 Git 仓库（`main` 分支、已提交）：

```bash
cd /Users/qienda/Documents/deepseek-harness/default-workspace
git remote add origin https://github.com/<你的用户名>/shiye-app.git
git push -u origin main
```

如果终端要求登录，请使用 GitHub 的 Personal Access Token（不要使用账号密码），或者用 GitHub Desktop 打开这个文件夹后点 Publish。

### 2. 在 Render 部署

1. 打开 <https://render.com/>，用 GitHub 登录；
2. 点 **New → Blueprint**；
3. 选择刚才的仓库；
4. Render 会读取 `render.yaml`，创建一个免费 Web Service；
5. 点 **Apply / Deploy**，等待构建完成（第一次会安装 Node、Python 和 edge-tts，约几分钟）；
6. 部署成功后会得到一个类似 `https://shiye-xxxx.onrender.com` 的 HTTPS 地址。

部署完成后可以先访问：

- `/api/health` 应返回 `{"ok":true,...}`；
- `/api/tts/status` 应返回 `available: true`（如果为 false，朗读会回退系统语音）。

打开这个地址，确认首页正常，再测试：

- 播放一本书，确认能生成自然人声；
- 搜索一本本地没有的书，确认在线结果能出来；
- 设置里填 AI Key，测试讨论。

### 3. 安装到各设备

- **iPhone / iPad**：Safari 打开网址 → 分享 → 添加到主屏幕；
- **Android**：Chrome 打开网址 → 菜单 → 安装应用 / 添加到主屏幕；
- **Mac**：Chrome 打开网址 → 地址栏右侧安装图标；
- **Windows**：Chrome/Edge 打开网址 → 安装应用。

安装后从桌面图标打开，就是独立窗口/全屏 App，不再需要局域网。

### 4. 每台设备单独设置

书架、进度、笔记、AI Key 都保存在**各自浏览器的 localStorage**，不会自动同步：

- 手机第一次打开需要重新填 AI Key；
- 想共用书架，需要后续做账号/云同步（当前版本没有）。

## 免费版的限制

Render 免费实例在一段时间无人使用后会休眠，下一次打开可能要等几十秒唤醒；如果每天使用，建议升级到最小付费实例，保持常驻。

Edge 自然人声和在线搜书都需要服务器访问外网：

- 如果云服务器访问微软 Edge 语音失败，播放会自动回退到系统语音；
- 如果豆瓣/古登堡在云端被限流，在线搜索结果可能减少，可换关键词或稍后再试。

## 方案二：Railway / Fly.io / 自己的服务器

项目是标准 Docker 应用，任何支持 Docker 的平台都可以：

```bash
docker build -t shiye .
docker run -d --name shiye -p 8080:8080 -e HOST=0.0.0.0 shiye
```

生产环境请放在 HTTPS 反向代理（Caddy / Nginx / 云平台自带 HTTPS）后面。  
Railway、Fly.io、Koyeb、Cloud Run 等平台选择 Docker 部署即可；端口使用平台注入的 `PORT`。

## 常见问题

**构建失败 / 一直 Building**  
打开 Render 的 Logs 查看。最常见的是第一次安装 Python 依赖超时，重新点一次 Manual Deploy 即可；持续失败把日志发我。

**自然人声不可用**  
访问 `/api/tts/status` 看 `available`。云服务器无法访问微软语音时会回退系统语音；可以换区域重新部署，或后续换成 Azure 语音。

**手机不能安装**  
必须使用 Render 给出的 HTTPS 地址；局域网 HTTP 地址只能做快捷方式。iPhone 用 Safari 的“添加到主屏幕”。

**免费实例很慢**  
免费实例会休眠，第一次打开需要唤醒。每天使用建议升级到最小付费实例。

## 安全说明

- AI Key 不会上传到服务器数据库，只随请求转发给你填写的 AI 服务商；
- 部署后的地址是公开的，陌生人如果知道地址也能调用无鉴权的朗读/搜书接口；个人使用建议使用不公开的域名，后续可以加访问密码和限流；
- 不要把 API Key 写进 `render.yaml`、Dockerfile 或代码仓库；
- 所有书摘、笔记、聊天记录都在浏览器本地。

## 更新

修改代码后推送到 GitHub，Render 会自动重新部署；也可以手动点 **Manual Deploy**。

## 我需要什么才能替你完成上线

代码和部署配置已经准备好。真正创建云服务需要你的账号授权，我不能替你注册或登录。  
你可以选择：

1. 按上面的步骤自己点完，把部署失败的日志发给我；
2. 或告诉我你已有的服务器/云平台，我给你对应的部署命令；
3. 如果使用 Render，把仓库地址发给我，我可以先帮你检查 `render.yaml` 和构建配置。
