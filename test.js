#!/usr/bin/env node
/**
 * database-mcp 测试脚本
 */

import { spawn } from 'child_process';

const env = {
  ...process.env,
  DB_TYPE: process.env.DB_TYPE || 'mysql',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '3306',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'test'
};

// 启动 MCP 服务器
const server = spawn('node', ['index.js'], {
  env: env,
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('🚀 启动 database-mcp 服务器...\n');

let requestId = 1;

// 发送 JSON-RPC 请求
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method: method,
    params: params
  };
  
  const requestStr = JSON.stringify(request) + '\n';
  console.log(`📤 发送请求: ${method}`);
  server.stdin.write(requestStr);
}

// 处理服务器响应
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      console.log('📥 收到响应:', JSON.stringify(response, null, 2));
      
      // 根据响应执行下一步
      if (response.id === 1) {
        // 初始化完成，测试连接
        setTimeout(() => {
          sendRequest('tools/call', {
            name: 'connect_db',
            arguments: {}
          });
        }, 1000);
      } else if (response.id === 2) {
        // 连接成功，列出表
        setTimeout(() => {
          sendRequest('tools/call', {
            name: 'list_tables',
            arguments: {}
          });
        }, 1000);
      } else if (response.id === 3) {
        // 获取表列表后结束
        console.log('\n✅ 测试完成！');
        server.kill();
        process.exit(0);
      }
    } catch (error) {
      // 可能不是 JSON，忽略
    }
  }
});

server.stderr.on('data', (data) => {
  const log = data.toString().trim();
  if (log) {
    console.error('📝 服务器日志:', log);
  }
});

server.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ 服务器异常退出，代码: ${code}`);
  }
});

// 第一步：初始化
setTimeout(() => {
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  });
}, 500);

// 超时处理
setTimeout(() => {
  console.error('⏰ 测试超时');
  server.kill();
  process.exit(1);
}, 15000);
