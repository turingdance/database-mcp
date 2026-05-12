# database-mcp

> [!NOTE]
> This README is also available in [English](README.md).

> 一个 MCP 服务，一套接口，直连 MySQL / MariaDB / TiDB / PostgreSQL / SQLite / Oracle / SQL Server 七种数据库。

## 快速开始

### 方式一：直接运行（npx）

```bash
# 直接执行，无需安装
npx @turingdance/database-mcp

# 或指定数据库环境变量
DB_TYPE=mysql DB_HOST=localhost DB_USER=root DB_PASSWORD=123456 DB_NAME=test npx @turingdance/database-mcp
```

### 方式二：本地安装

```bash
# 全局安装
npm install -g @turingdance/database-mcp

# 或在项目中安装
npm install @turingdance/database-mcp
```

### 方式三：本地运行源码

```bash
git clone https://github.com/turingdance/database-mcp.git
cd database-mcp
npm install
npm start
```

---

## 特色

- **一套配置，七种数据库** — 切换数据库只需改一个环境变量 `DB_TYPE`
- **MySQL 兼容** — MariaDB、TiDB 共用 `mysql2` 驱动，零额外依赖
- **敏感操作防护** — INSERT / UPDATE / DELETE / DROP / TRUNCATE / ALTER 等需用户显式确认
- **风险分级拦截** — 高危（不可逆）、中危（数据变更）、低危（只读）自动检测
- **参数化查询** — 防 SQL 注入
- **动态加载驱动** — 按需加载，启动迅速

---

## 工具

| 工具 | 说明 | 风险 |
|---|---|---|
| `connect_db` | 测试连接 | 低 |
| `list_tables` | 列出所有表 | 低 |
| `describe_table` | 查看表结构 | 低 |
| `query` | SELECT 查询 | 低 |
| `execute` | 写操作（需 confirm） | 按语句分级 |

---

## 环境变量配置

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DB_TYPE` | 数据库类型：`mysql` / `mariadb` / `tidb` / `postgresql` / `sqlite` / `oracle` / `sqlserver` | `sqlite` |
| `DB_HOST` | 主机地址 | `localhost` |
| `DB_PORT` | 端口 | 各数据库默认端口 |
| `DB_USER` | 用户名 | - |
| `DB_PASSWORD` | 密码 | - |
| `DB_NAME` | 数据库名（SQLite 无需） | `mcp-db` |
| `DB_FILE` | SQLite 文件路径（仅 SQLite） | `mcp.db` |

---

## 数据库配置示例

### MySQL

```bash
DB_TYPE=mysql \
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_USER=root \
DB_PASSWORD=your_password \
DB_NAME=your_database \
npx @turingdance/database-mcp
```

### PostgreSQL

```bash
DB_TYPE=postgresql \
DB_HOST=127.0.0.1 \
DB_PORT=5432 \
DB_USER=postgres \
DB_PASSWORD=your_password \
DB_NAME=your_database \
npx @turingdance/database-mcp
```

### SQLite

```bash
DB_TYPE=sqlite \
DB_FILE=/path/to/your.db \
npx @turingdance/database-mcp
```

### SQL Server

```bash
DB_TYPE=sqlserver \
DB_HOST=127.0.0.1 \
DB_PORT=1433 \
DB_USER=sa \
DB_PASSWORD=your_password \
DB_NAME=your_database \
npx @turingdance/database-mcp
```

### MariaDB / TiDB

配置方式与 MySQL 完全相同，仅需将 `DB_TYPE` 改为 `mariadb` 或 `tidb`。

---

## WorkBuddy / Claude Desktop 配置

### 配置文件格式

将以下配置写入 `~/.workbuddy/mcp.json` 或 Claude Desktop 的 MCP 配置文件：

```json
{
  "mcpServers": {
    "database-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@turingdance/database-mcp"
      ],
      "env": {
        "DB_TYPE": "mysql",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "DB_NAME": "your_database"
      }
    }
  }
}
```

### 本地源码配置

如果使用本地源码：

```json
{
  "mcpServers": {
    "database-mcp": {
      "command": "node",
      "args": ["/path/to/database-mcp/index.js"],
      "env": {
        "DB_TYPE": "mysql",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "your_password",
        "DB_NAME": "your_database"
      }
    }
  }
}
```

---

## 安全机制

| 等级 | 关键字 | 行为 |
|---|---|---|
| **高危** | DROP, TRUNCATE, ALTER | 需 `confirm: true`，服务端记日志 |
| **中危** | INSERT, DELETE, UPDATE, REPLACE, RENAME, GRANT, REVOKE | 需 `confirm: true` |
| **低危** | SELECT, SHOW, DESCRIBE, PRAGMA 等 | 直接执行 |

### 未确认时响应

```json
{
  "status": "rejected",
  "risk_level": "medium",
  "detected_operation": "INSERT",
  "message": "检测到中危（数据变更）操作 [INSERT]，必须传入 confirm: true 才能执行。"
}
```

### 确认后执行

```json
{
  "tool": "execute",
  "arguments": {
    "sql": "INSERT INTO users (name, email) VALUES ('张三', 'zhangsan@example.com')",
    "confirm": true,
    "reason": "测试插入数据"
  }
}
```

---

## 使用示例

### 查询数据库

```
查询所有表
```

AI 会调用 `list_tables` 工具。

---

```
查看 users 表的结构
```

AI 会调用 `describe_table` 工具。

---

```
查询 users 表的前10条数据
```

AI 会调用 `query` 工具执行 SELECT 语句。

### 插入数据

```
向 users 表插入一条数据：name=张三，email=zhangsan@example.com
```

AI 会：
1. 尝试执行 INSERT（被拦截）
2. 提示需要确认
3. 您确认后，再次执行（带 confirm）

---

## 技术栈

- Node.js (ESM) + `@modelcontextprotocol/server` v2 + zod v4
- 驱动：mysql2（MySQL/MariaDB/TiDB） / pg / better-sqlite3 / oracledb / tedious（SQL Server）

---

## License

ISC

---

## 问题反馈

- GitHub Issues: https://github.com/turingdance/database-mcp/issues
- Email: 271151388@qq.com
