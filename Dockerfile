# 使用官方 Node.js 18 镜像作为基础镜像
FROM node:18-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果有）
COPY package.json ./

# 安装依赖
RUN npm install

# 复制所有项目文件到容器中
COPY . .

# 设置环境变量（可选，默认值已在 server.js 中定义）
# ENV FILE_PATH=./temps
# ENV UUID=8bdbf518-a4a7-8278-6c1e-27fbe78fb75b
# ENV CFIP=www.digitalocean.com
# ENV CFPORT=443
# ENV NAME=ArG
# ENV XRAY_PORT=3000
# ENV HTTP_PORT=7680

# 暴露应用的端口（根据 PaaS 平台的要求动态使用 PORT）
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
