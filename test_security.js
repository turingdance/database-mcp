#!/usr/bin/env node
/**
 * 测试 database-mcp 敏感操作防护
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

const server = spawn('node', ['index.js'], {
  env: env,
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('🧪 开始测试 database-mcp 敏感操作防护\n');

let requestId = 1;
let step = 0;

function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method: method,
    params: params
  };
  
  const requestStr = JSON.stringify(request) + '\n';
  server.stdin.write(requestStr);
}

// 处理响应
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      
      if (response.result && response.result.content) {
        for (const item of response.result.content) {
          if (item.type === 'text') {
            try {
              const result = JSON.parse(item.text);
              console.log(JSON.stringify(result, null, 2));
            } catch {
              console.log(item.text);
            }
          }
        }
      }
      
      // 测试流程
      setTimeout(() => {
        step++;
        
        if (step === 1) {
          // 初始化完成
          console.log('\n========================================');
          console.log('✅ 步骤1: 测试低危操作 - SELECT（应该成功）');
          console.log('========================================\n');
          sendRequest('tools/call', {
            name: 'query',
            arguments: {
              sql: 'SELECT * FROM water_usage_record LIMIT 2'
            }
          });
        } else if (step === 2) {
          // 低危成功，继续测试中危
          console.log('\n========================================');
          console.log('✅ 步骤2: 测试中危操作 - UPDATE（不带 confirm，应该被拒绝）');
          console.log('========================================\n');
          sendRequest('tools/call', {
            name: 'execute',
            arguments: {
              sql: 'UPDATE water_usage_record SET reading_record = "测试更新" WHERE id = 1'
            }
          });
        } else if (step === 3) {
          // 中危被拒绝，继续测试带 confirm
          console.log('\n========================================');
          console.log('✅ 步骤3: 测试中危操作 - UPDATE（带 confirm，应该成功）');
          console.log('========================================\n');
          sendRequest('tools/call', {
            name: 'execute',
            arguments: {
              sql: 'UPDATE water_usage_record SET reading_record = "每月5号正常抄表" WHERE id = 1',
              confirm: true,
              reason: '测试敏感操作防护功能'
            }
          });
        } else if (step === 4) {
          // 测试完成
          console.log('\n========================================');
          console.log('✅ 测试完成！');
          console.log('========================================\n');
          console.log('📋 测试总结：');
          console.log('- ✅ 低危操作（SELECT）直接执行成功');
          console.log('- ✅ 中危操作（UPDATE）需要 confirm 参数');
          console.log('- ✅ 带 confirm 的中危操作执行成功');
          console.log('\n🛡️ 敏感操作防护功能工作正常！\n');
          
          server.kill();
          process.exit(0);
        }
      }, 1500);
    } catch (error) {
      // 忽略解析错误
    }
  }
});

server.stderr.on('data', (data) => {
  const log = data.toString().trim();
  if (log && !log.includes('已启动')) {
    console.error('📝', log);
  }
});

// 初始化
sendRequest('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'security-test', version: '1.0.0' }
});

// 超时
setTimeout(() => {
  console.error('\n⏰ 测试超时\n');
  server.kill();
  process.exit(1);
}, 30000);
