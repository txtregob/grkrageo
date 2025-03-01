const FILE_PATH = process.env.FILE_PATH || './temps';
const UUID = process.env.UUID || '8bdbf518-a4a7-8278-6c1e-27fbe78fb75b';
const RGOE_DOMAIN = process.env.RGOE_DOMAIN || '';
const RGOE_AUTH = process.env.RGOE_AUTH || '';
const CFIP = process.env.CFIP || 'www.digitalocean.com';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'ArG';
const XRAY_PORT = process.env.XRAY_PORT || 3000;
const HTTP_PORT = process.env.PORT || 3000;

const XRAY_DOWNLOAD_ARM = process.env.XRAY_DOWNLOAD_ARM || 'https://github.com/codsandbx/ndjsagro/raw/refs/heads/main/xnc/Xcore-linux-v8a.zip';
const XRAY_DOWNLOAD_AMD = process.env.XRAY_DOWNLOAD_AMD || 'https://github.com/codsandbx/ndjsagro/raw/refs/heads/main/xnc/Xcore-linux-64.zip';
const CLOUDFLARED_DOWNLOAD_ARM = process.env.CLOUDFLARED_DOWNLOAD_ARM || 'https://github.com/codsandbx/ndjsagro/raw/refs/heads/main/xnc/cldflred-linux-arm64.zip';
const CLOUDFLARED_DOWNLOAD_AMD = process.env.CLOUDFLARED_DOWNLOAD_AMD || 'https://github.com/codsandbx/ndjsagro/raw/refs/heads/main/xnc/cldflred-linux-amd64.zip';

const XRAY_NAME = process.env.XRAY_NAME || 'xwebs';
const CLOUDFLARED_NAME = process.env.CLOUDFLARED_NAME || 'cftnls';

const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const axios = require('axios');
const { spawn, execSync } = require('child_process');
const AdmZip = require('adm-zip');

const app = express();

if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
    console.log(`${FILE_PATH} is created`);
} else {
    console.log(`${FILE_PATH} already exists`);
}

function cleanupOldFiles() {
    const files = ['boot.log', 'sub.txt', 'config.json', 'tunnel.json', 'tunnel.yml', 'temp.download'];
    files.forEach(file => {
        const filePath = path.join(FILE_PATH, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`${filePath} deleted`);
        }
    });
}
cleanupOldFiles();

function RGOEConfigure() {
    console.log(`RGOE_DOMAIN: ${process.env.RGOE_DOMAIN}`);
    console.log(`RGOE_AUTH: ${process.env.RGOE_AUTH}`);
    if (!RGOE_AUTH || !RGOE_DOMAIN) {
        console.log('\x1b[32mRGOE_DOMAIN or RGOE_AUTH variable is empty, use quick tunnels\x1b[0m');
        return false;
    }
    if (RGOE_AUTH.includes('TunnelSecret')) {
        try {
            const authObj = JSON.parse(RGOE_AUTH);
            if (!authObj.TunnelID || !authObj.TunnelSecret) {
                throw new Error('RGOE_AUTH missing TunnelID or TunnelSecret');
            }
            fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), RGOE_AUTH);
            console.log(`tunnel.json written: ${RGOE_AUTH}`);
            const tunnelId = authObj.TunnelID;
            console.log(`Extracted TunnelID: ${tunnelId}`);
            const tunnelConfig = `
tunnel: ${tunnelId}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
protocol: http2
ingress:
  - hostname: ${RGOE_DOMAIN}
    service: http://localhost:${XRAY_PORT}
    originRequest:
      noTLSVerify: true
  - service: http_status:404
`;
            fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelConfig);
            console.log(`tunnel.yml written: ${tunnelConfig}`);
        } catch (err) {
            console.error(`RGOEConfigure failed: ${err.message}`);
            return false;
        }
    }
    return true;
}
const isFixedTunnel = RGOEConfigure();

function generateConfig() {
    const config = {
        "log": { "access": "/dev/null", "error": "/dev/null", "loglevel": "info" },
        "inbounds": [
            { 
                "port": XRAY_PORT, 
                "listen": "0.0.0.0",
                "protocol": "vless", 
                "settings": { 
                    "clients": [{ "id": UUID, "flow": "xtls-rprx-vision" }], 
                    "decryption": "none", 
                    "fallbacks": [
                        { "dest": HTTP_PORT },
                        { "path": "/vless", "dest": 3001 },
                        { "path": "/vmess", "dest": 3002 },
                        { "path": "/trojan", "dest": 3003 }
                    ] 
                }, 
                "streamSettings": { "network": "tcp" } 
            },
            { 
                "port": 3001, 
                "listen": "127.0.0.1", 
                "protocol": "vless", 
                "settings": { "clients": [{ "id": UUID, "level": 0 }], "decryption": "none" }, 
                "streamSettings": { "network": "ws", "security": "none", "wsSettings": { "path": "/vless" } },
                "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "metadataOnly": false }
            },
            { 
                "port": 3002, 
                "listen": "127.0.0.1", 
                "protocol": "vmess", 
                "settings": { "clients": [{ "id": UUID, "alterId": 0 }] }, 
                "streamSettings": { "network": "ws", "wsSettings": { "path": "/vmess" } },
                "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "metadataOnly": false }
            },
            { 
                "port": 3003, 
                "listen": "127.0.0.1", 
                "protocol": "trojan", 
                "settings": { "clients": [{ "password": UUID }] }, 
                "streamSettings": { "network": "ws", "security": "none", "wsSettings": { "path": "/trojan" } },
                "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "metadataOnly": false }
            }
        ],
        "outbounds": [
            { "protocol": "freedom" },
            { "tag": "WARP", "protocol": "wireguard", "settings": { "secretKey": "AB+YclUZigV54ZKbGlnKYyCzEa31lMbwOkvezpBlV3c=", "address": ["172.16.0.2/32", "2606:4700:110:825e:3c8c:1df2:6937:1731/128"], "peers": [{ "publicKey": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=", "allowedIPs": ["0.0.0.0/0", "::/0"], "endpoint": "engage.cloudflareclient.com:2408" }], "mtu": 1280 } }
        ],
        "dns": { "servers": ["https+local://8.8.8.8/dns-query"] },
        "routing": { "domainStrategy": "AsIs", "rules": [{ "type": "field", "domain": ["domain:openai.com", "domain:ai.com", "domain:grok.com"], "outboundTag": "WARP" }] }
    };
    fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

async function downloadFiles() {
    const arch = os.arch();
    const files = arch === 'arm' || arch === 'arm64' || arch === 'aarch64' ? [
        { url: XRAY_DOWNLOAD_ARM, name: XRAY_NAME },
        { url: CLOUDFLARED_DOWNLOAD_ARM, name: CLOUDFLARED_NAME }
    ] : [
        { url: XRAY_DOWNLOAD_AMD, name: XRAY_NAME },
        { url: CLOUDFLARED_DOWNLOAD_AMD, name: CLOUDFLARED_NAME }
    ];

    for (const file of files) {
        const targetPath = path.join(FILE_PATH, file.name);
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
            console.log(`\x1b[32m${file.name} already exists at ${targetPath} and is valid, skipping download\x1b[0m`);
            fs.chmodSync(targetPath, 0o755);
        } else {
            const tempPath = path.join(FILE_PATH, 'temp.download');
            try {
                const response = await axios({
                    method: 'get',
                    url: file.url,
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
                    maxRedirects: 10
                });
                fs.writeFileSync(tempPath, Buffer.from(response.data));
                console.log(`\x1b[32mDownloaded ${file.url} to ${tempPath}\x1b[0m`);

                const buffer = fs.readFileSync(tempPath);
                const isZip = buffer.slice(0, 4).toString('hex') === '504b0304';
                if (isZip) {
                    await unzipFile(tempPath, file.name);
                    fs.unlinkSync(tempPath);
                    console.log(`\x1b[32mUnzipped and deleted ${tempPath}\x1b[0m`);
                } else {
                    fs.renameSync(tempPath, targetPath);
                    console.log(`\x1b[32mRenamed ${tempPath} to ${targetPath}\x1b[0m`);
                }
                fs.chmodSync(targetPath, 0o755);
            } catch (err) {
                console.error(`Failed to download ${file.url}: ${err.message}`);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                console.log(`\x1b[33mProceeding with existing files if available\x1b[0m`);
            }
        }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
}

async function unzipFile(zipPath, outputName) {
    const outputPath = path.join(FILE_PATH, outputName);
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(fs.readFileSync(zipPath));
            const entries = zip.getEntries();
            const binaryEntry = entries.find(entry => 
                !entry.isDirectory && 
                !entry.entryName.endsWith('.dat') && 
                !entry.entryName.endsWith('.txt') && 
                (entry.entryName.includes('xray') || 
                 entry.entryName.includes('Xcore') || 
                 entry.entryName.includes('cloudflared') || 
                 entry.entryName.includes('cldflred') || 
                 !path.extname(entry.entryName) || 
                 entry.entryName.endsWith('.exe'))
            );
            if (binaryEntry) {
                fs.writeFileSync(outputPath, binaryEntry.getData());
                console.log(`Extracted ${binaryEntry.entryName} to ${outputPath}`);
                resolve();
            } else {
                reject(new Error('No executable binary found in ZIP'));
            }
        } catch (err) {
            reject(new Error(`Error unzipping ${zipPath}: ${err}`));
        }
    });
}

function runServices() {
    const web = spawn(`${FILE_PATH}/${XRAY_NAME}`, ['-c', `${FILE_PATH}/config.json`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    web.stdout.on('data', data => console.log(`Xray stdout: ${data}`));
    web.stderr.on('data', data => console.error(`Xray stderr: ${data}`));
    web.on('error', err => console.error(`Xray error: ${err}`));
    web.unref();
    console.log('\x1b[32mweb is running\x1b[0m');

    setTimeout(() => {
        let botArgs;
        console.log(`isFixedTunnel: ${isFixedTunnel}`);
        if (isFixedTunnel) {
            if (RGOE_AUTH.includes('TunnelSecret')) {
                botArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', '--config', `${FILE_PATH}/tunnel.yml`, 'run'];
                console.log(`Starting Cloudflared with config: ${botArgs.join(' ')}`);
            } else {
                botArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', '--token', RGOE_AUTH, 'run'];
                console.log(`Starting Cloudflared with token: ${RGOE_AUTH}`);
            }
        } else {
            botArgs = ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${XRAY_PORT}`, '--logfile', `${FILE_PATH}/boot.log`, '--loglevel', 'info'];
            console.log(`Starting Cloudflared with quick tunnel: ${botArgs.join(' ')}`);
        }
        const bot = spawn(`${FILE_PATH}/${CLOUDFLARED_NAME}`, botArgs, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
        bot.stdout.on('data', data => console.log(`bot stdout: ${data}`));
        bot.stderr.on('data', data => console.error(`bot stderr: ${data}`));
        bot.on('error', err => console.error(`bot error: ${err}`));
        bot.unref();
        console.log('\x1b[32mbot is running\x1b[0m');
    }, 2000);

    app.get('/', (req, res) => {
        const indexPath = path.join(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('404 Not Found');
        }
    });
    app.listen(HTTP_PORT, '0.0.0.0', () => console.log(`Http server is running on port: ${HTTP_PORT}`));
}

function getRGOEDomain() {
    if (isFixedTunnel) return RGOE_DOMAIN;
    if (fs.existsSync(path.join(FILE_PATH, 'boot.log'))) {
        const bootLog = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
        const match = bootLog.match(/https:\/\/[a-zA-Z0-9+\.-]+\.trycloudflare\.com/);
        return match ? match[0].replace('https://', '') : '';
    }
    return '';
}

async function generateLinks() {
    await new Promise(resolve => setTimeout(resolve, 15000));
    const RGOEDomain = getRGOEDomain();
    console.log(`\x1b[32mRGOEDomain: \x1b[35m${RGOEDomain}\x1b[0m`);

    let isp;
    try {
        isp = execSync('curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'', { encoding: 'utf-8' }).trim();
    } catch {
        isp = 'unknown';
    }

    const vmess = JSON.stringify({ "v": "2", "ps": `${NAME}-${isp}`, "add": CFIP, "port": CFPORT, "id": UUID, "aid": "0", "scy": "none", "net": "ws", "type": "none", "host": RGOEDomain, "path": "/vmess", "tls": "tls", "sni": RGOEDomain, "alpn": "" });
    const list = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${RGOEDomain}&type=ws&host=${RGOEDomain}&path=%2Fvless%3Fed%3D2048#${NAME}-${isp}
vmess://${Buffer.from(vmess).toString('base64')}
trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${RGOEDomain}&type=ws&host=${RGOEDomain}&path=%2Ftrojan%3Fed%3D2048#${NAME}-${isp}
`;
    fs.writeFileSync(path.join(FILE_PATH, 'list.txt'), list);
    fs.writeFileSync(path.join(FILE_PATH, 'sub.txt'), Buffer.from(list).toString('base64'));
    console.log(fs.readFileSync(path.join(FILE_PATH, 'sub.txt'), 'utf-8'));
    console.log(`\x1b[32m${FILE_PATH}/sub.txt saved successfully\x1b[0m`);
}

async function main() {
    await downloadFiles();
    generateConfig();
    runServices();
    await generateLinks();
    console.log('\x1b[96mRunning done!\x1b[0m');
    console.log('\x1b[96mThank you for using this script, enjoy!\x1b[0m');
    await new Promise(resolve => setTimeout(resolve, 12000));
    console.clear();
}

main().catch(err => console.error('Startup failed:', err));
