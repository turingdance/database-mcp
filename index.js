import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

// ============================================================
// 环境变量配置
// ============================================================
const DB_TYPE     = process.env.DB_TYPE     || "sqlite";
const DB_HOST     = process.env.DB_HOST     || "localhost";
const DB_PORT     = process.env.DB_PORT     || null;
const DB_USER     = process.env.DB_USER     || "";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME     = process.env.DB_NAME     || "mcp-db";
const DB_FILE     = process.env.DB_FILE     || "mcp.db";

// ============================================================
// MySQL 兼容类型（共用 mysql2 驱动）
// ============================================================
const MYSQL_COMPAT_TYPES = ["mysql", "mariadb", "tidb"];

// ============================================================
// 数据库驱动动态 import
// ============================================================
let mysqlDriver = null;
let pgDriver = null;
let oracleDriver = null;
let sqliteDriver = null;
let mssqlDriver = null;

async function loadDriver(type) {
  if (MYSQL_COMPAT_TYPES.includes(type) && !mysqlDriver)
    mysqlDriver = (await import("mysql2/promise")).default;
  if (type === "postgresql" && !pgDriver)          pgDriver     = (await import("pg")).default;
  if (type === "oracle" && !oracleDriver)            oracleDriver = (await import("oracledb")).default;
  if (type === "sqlite" && !sqliteDriver)            sqliteDriver = (await import("better-sqlite3")).default;
  if (type === "sqlserver" && !mssqlDriver)          mssqlDriver  = (await import("tedious")).default;
}

// ============================================================
// 通用数据库连接工厂
// ============================================================
async function getDbConnection() {
  if (MYSQL_COMPAT_TYPES.includes(DB_TYPE)) {
    await loadDriver(DB_TYPE);
    const port = DB_PORT ? parseInt(DB_PORT) : 3306;
    return await mysqlDriver.createConnection({
      host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
    });
  }

  if (DB_TYPE === "sqlserver") {
    await loadDriver("sqlserver");
    const port = DB_PORT ? parseInt(DB_PORT) : 1433;
    const conn = new mssqlDriver.Connection({
      server: DB_HOST, port,
      authentication: { type: "default", options: { userName: DB_USER, password: DB_PASSWORD } },
      options: { database: DB_NAME, trustServerCertificate: true },
    });
    // tedious connect is callback-based, wrap in promise
    await new Promise((resolve, reject) => {
      conn.connect((err) => err ? reject(err) : resolve());
    });
    return conn;
  }

  if (DB_TYPE === "postgresql") {
    await loadDriver("postgresql");
    const port = DB_PORT ? parseInt(DB_PORT) : 5432;
    const client = new pgDriver.Client({
      host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
    });
    await client.connect();
    return client;
  }

  if (DB_TYPE === "oracle") {
    await loadDriver("oracle");
    const port = DB_PORT || 1521;
    return await oracleDriver.getConnection({
      user: DB_USER, password: DB_PASSWORD,
      connectString: `${DB_HOST}:${port}/${DB_NAME}`,
    });
  }

  if (DB_TYPE === "sqlite") {
    await loadDriver("sqlite");
    return new sqliteDriver(DB_FILE);
  }

  throw new Error(`不支持的数据库类型：${DB_TYPE}`);
}

// ============================================================
// 连接关闭
// ============================================================
async function closeConnection(conn) {
  try {
    if (MYSQL_COMPAT_TYPES.includes(DB_TYPE))  await conn.end();
    else if (DB_TYPE === "postgresql")         await conn.end();
    else if (DB_TYPE === "oracle")             await conn.close();
    else if (DB_TYPE === "sqlite")             conn.close();
    else if (DB_TYPE === "sqlserver")          conn.close();
  } catch (_) {}
}

// ============================================================
// withConnection：自动管理连接生命周期
// ============================================================
async function withConnection(fn) {
  const conn = await getDbConnection();
  try {
    return await fn(conn);
  } finally {
    await closeConnection(conn);
  }
}

// ============================================================
// 统一查询执行
// ============================================================
async function executeQuery(conn, sql, params) {
  if (DB_TYPE === "sqlite") {
    const stmt = conn.prepare(sql);
    const rows = stmt.all(...(params || []));
    if (rows.length === 0) return { columns: [], rows: [] };
    return { columns: Object.keys(rows[0]), rows: rows.map(r => Object.values(r)) };
  }

  if (MYSQL_COMPAT_TYPES.includes(DB_TYPE)) {
    const [rows] = await conn.execute(sql, params || []);
    if (!rows || rows.length === 0) return { columns: [], rows: [] };
    return { columns: Object.keys(rows[0]), rows: rows.map(r => Object.values(r)) };
  }

  if (DB_TYPE === "sqlserver") {
    const result = await new Promise((resolve, reject) => {
      const req = new mssqlDriver.Request(conn);
      req.sqlTextOrProc = sql;
      if (params && params.length > 0) {
        params.forEach((p, i) => req.addParameter(`p${i}`, getType(p), p));
      }
      req._rows = [];
      req.on("row", (columns) => {
        const row = {};
        for (const col of columns) row[col.metadata.colName] = col.value;
        req._rows.push(row);
      });
      req.on("doneProc", () => {
        const rows = req._rows;
        if (rows.length === 0) return resolve({ columns: [], rows: [] });
        resolve({ columns: Object.keys(rows[0]), rows: rows.map(r => Object.values(r)) });
      });
      req.on("error", reject);
      conn.execSql(req);
    });
    return result;
  }

  if (DB_TYPE === "postgresql") {
    const result = await conn.query(sql, params || []);
    const rows = result.rows || [];
    const columns = result.fields ? result.fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
    return { columns, rows: rows.map(r => columns.map(c => r[c])) };
  }

  if (DB_TYPE === "oracle") {
    const result = await conn.execute(sql, params || []);
    const columns = (result.metaData || []).map(m => m.name);
    const rows = (result.rows || []).map(r => [...r]);
    return { columns, rows };
  }
}

// ============================================================
// 统一写操作执行
// ============================================================
async function executeWrite(conn, sql, params) {
  if (DB_TYPE === "sqlite") {
    const stmt = conn.prepare(sql);
    return stmt.run(...(params || [])).changes;
  }

  if (MYSQL_COMPAT_TYPES.includes(DB_TYPE)) {
    const [result] = await conn.execute(sql, params || []);
    return result.affectedRows;
  }

  if (DB_TYPE === "sqlserver") {
    return await new Promise((resolve, reject) => {
      const req = new mssqlDriver.Request(conn);
      req.sqlTextOrProc = sql;
      if (params && params.length > 0) {
        params.forEach((p, i) => req.addParameter(`p${i}`, getType(p), p));
      }
      req.on("doneProc", (rowCount, more, rows) => {
        resolve(rowCount || 0);
      });
      req.on("error", reject);
      conn.execSql(req);
    });
  }

  if (DB_TYPE === "postgresql") {
    const result = await conn.query(sql, params || []);
    return result.rowCount || 0;
  }

  if (DB_TYPE === "oracle") {
    const result = await conn.execute(sql, params || []);
    await conn.commit();
    return result.rowsAffected || 0;
  }
}

// ============================================================
// 辅助
// ============================================================
function rowsToDicts(columns, rows) {
  return rows.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// tedious 参数类型映射
function getType(val) {
  if (val === null || val === undefined) return mssqlDriver.TYPES.Null;
  if (typeof val === "number") return Number.isInteger(val) ? mssqlDriver.TYPES.Int : mssqlDriver.TYPES.Float;
  if (typeof val === "boolean") return mssqlDriver.TYPES.Bit;
  if (val instanceof Date) return mssqlDriver.TYPES.DateTime;
  return mssqlDriver.TYPES.NVarChar;
}

// ============================================================
// 敏感操作检测
// ============================================================
const SENSITIVE_KEYWORDS = ["INSERT", "DELETE", "DROP", "UPDATE", "ALTER", "TRUNCATE", "REPLACE", "RENAME", "GRANT", "REVOKE"];
const DESTRUCTIVE_KEYWORDS = ["DROP", "TRUNCATE", "ALTER"];

function classifySQL(sql) {
  const firstWord = sql.trim().toUpperCase().split(/\s+/)[0];
  if (DESTRUCTIVE_KEYWORDS.includes(firstWord)) return { level: "high", keyword: firstWord };
  if (SENSITIVE_KEYWORDS.includes(firstWord)) return { level: "medium", keyword: firstWord };
  return { level: "low", keyword: null };
}

function getRiskLabel(level) {
  if (level === "high") return "高危（不可逆）";
  if (level === "medium") return "中危（数据变更）";
  return "低危（只读）";
}

// ============================================================
// 创建 MCP Server
// ============================================================
const server = new McpServer({
  name: "database-mcp",
  version: "2.0.0",
});

// -------------------------------------------------------
// Tool: connect_db
// -------------------------------------------------------
server.registerTool(
  "connect_db",
  {
    description: "测试数据库连接（通用）",
  },
  async () => {
    try {
      await withConnection(async () => {});
      return { content: [{ type: "text", text: JSON.stringify({ status: "success", db_type: DB_TYPE, message: "连接成功" }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: e.message }) }] };
    }
  }
);

// -------------------------------------------------------
// Tool: list_tables
// -------------------------------------------------------
server.registerTool(
  "list_tables",
  {
    description: "获取当前库所有表（通用）",
  },
  async () => {
    try {
      let sql;
      if (MYSQL_COMPAT_TYPES.includes(DB_TYPE))   sql = "SHOW TABLES";
      else if (DB_TYPE === "sqlserver")           sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'";
      else if (DB_TYPE === "postgresql")          sql = "SELECT tablename FROM pg_tables WHERE schemaname='public'";
      else if (DB_TYPE === "oracle")              sql = "SELECT table_name FROM user_tables";
      else if (DB_TYPE === "sqlite")              sql = "SELECT name FROM sqlite_master WHERE type='table'";

      const result = await withConnection(conn => executeQuery(conn, sql));
      const tables = result.rows.map(r => r[0]);
      return { content: [{ type: "text", text: JSON.stringify(tables) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// -------------------------------------------------------
// Tool: describe_table
// -------------------------------------------------------
server.registerTool(
  "describe_table",
  {
    description: "获取表结构（通用）",
    inputSchema: z.object({ table_name: z.string().describe("表名") }).toJSONSchema(),
  },
  async ({ table_name }) => {
    try {
      let sql;
      let queryParams = null;

      if (MYSQL_COMPAT_TYPES.includes(DB_TYPE)) {
        sql = `DESCRIBE \`${table_name}\``;
      } else if (DB_TYPE === "sqlserver") {
        sql = "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @p0";
        queryParams = [table_name];
      } else if (DB_TYPE === "postgresql") {
        sql = "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1";
        queryParams = [table_name];
      } else if (DB_TYPE === "oracle") {
        sql = "SELECT column_name, data_type, nullable FROM user_tab_columns WHERE table_name = UPPER(:1)";
        queryParams = [table_name];
      } else if (DB_TYPE === "sqlite") {
        sql = `PRAGMA table_info("${table_name}")`;
      }

      const result = await withConnection(conn => executeQuery(conn, sql, queryParams));
      return { content: [{ type: "text", text: JSON.stringify(rowsToDicts(result.columns, result.rows)) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// -------------------------------------------------------
// Tool: query（只读查询）
// -------------------------------------------------------
server.registerTool(
  "query",
  {
    description: "通用查询（SELECT），参数化防注入",
    inputSchema: z.object({
      sql: z.string().describe("SQL 查询语句"),
      params: z.array(z.any()).optional().describe("查询参数（可选）"),
    }).toJSONSchema(),
  },
  async ({ sql, params }) => {
    try {
      const result = await withConnection(conn => executeQuery(conn, sql, params));
      return { content: [{ type: "text", text: JSON.stringify(rowsToDicts(result.columns, result.rows)) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// -------------------------------------------------------
// Tool: execute（写操作，敏感操作需确认）
// -------------------------------------------------------
server.registerTool(
  "execute",
  {
    description: "通用写操作（INSERT/UPDATE/DELETE/DROP 等），敏感操作需传入 confirm=true,必需人工确认输入",
    inputSchema: z.object({
      sql: z.string().describe("SQL 写操作语句"),
      params: z.array(z.any()).optional().describe("查询参数（可选）"),
      confirm: z.boolean().optional().describe("确认执行敏感操作（INSERT/DELETE/DROP/UPDATE/ALTER/TRUNCATE 时必须为 true）"),
      reason: z.string().optional().describe("执行原因说明（建议填写）"),
    }).toJSONSchema(),
  },
  async ({ sql, params, confirm, reason }) => {
    try {
      const { level, keyword } = classifySQL(sql);

      // 敏感操作必须确认
      if (level !== "low" && !confirm) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            status: "rejected",
            risk_level: level,
            risk_label: getRiskLabel(level),
            detected_operation: keyword,
            message: `检测到${getRiskLabel(level)}操作 [${keyword}]，必须传入 confirm: true 才能执行。请确认后重试。`,
            hint: level === "high"
              ? `${keyword} 操作将永久删除数据/结构，请确保已做好备份！`
              : `${keyword} 操作将修改数据，请确认 SQL 和参数正确。`,
            sql_preview: sql.trim().substring(0, 200),
          }, null, 2) }],
        };
      }

      // 高危操作日志警告
      if (level === "high") {
        console.error(`[database-mcp] ⚠️ 高危操作执行: [${keyword}] | 原因: ${reason || "未提供"} | SQL: ${sql.trim().substring(0, 300)}`);
      }

      const affectedRows = await withConnection(async (conn) => {
        return await executeWrite(conn, sql, params);
      });

      return { content: [{ type: "text", text: JSON.stringify({ status: "success", affected_rows: affectedRows, risk_level: level }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: e.message }) }] };
    }
  }
);

// ============================================================
// Resource: dbagent://info
// ============================================================
server.registerResource(
  "database-info",
  "dbagent://info",
  { description: "当前端点操作的数据库信息" },
  async (uri) => {
    try {
      let sql;
      if (MYSQL_COMPAT_TYPES.includes(DB_TYPE))   sql = "SHOW TABLES";
      else if (DB_TYPE === "sqlserver")           sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'";
      else if (DB_TYPE === "postgresql")          sql = "SELECT tablename FROM pg_tables WHERE schemaname='public'";
      else if (DB_TYPE === "oracle")              sql = "SELECT table_name FROM user_tables";
      else if (DB_TYPE === "sqlite")              sql = "SELECT name FROM sqlite_master WHERE type='table'";

      const tables = await withConnection(async (conn) => {
        return (await executeQuery(conn, sql)).rows.map(r => r[0]);
      });

      const info = {
        db_type: DB_TYPE,
        host: DB_HOST,
        database: DB_TYPE === "sqlite" ? DB_FILE : DB_NAME,
        tables: tables,
      };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(info, null, 2) }],
      };
    } catch (e) {
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ error: e.message }) }],
      };
    }
  }
);

// ============================================================
// 启动服务（stdio）
// ============================================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[database-mcp] 已启动 | 类型: ${DB_TYPE} | 主机: ${DB_HOST} | 库: ${DB_TYPE === "sqlite" ? DB_FILE : DB_NAME}`);
}

main().catch((err) => {
  console.error("[database-mcp] 启动失败:", err);
  process.exit(1);
});
