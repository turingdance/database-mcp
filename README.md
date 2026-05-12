# database-mcp

> [!NOTE]
> This README is available in [简体中文](README.zh-CN.md).

> An MCP server with one unified API, connecting directly to MySQL, MariaDB, TiDB, PostgreSQL, SQLite, Oracle, SQL Server, and seven other databases.

## Quick Start

### Option 1: Direct Execution (npx)

```bash
# Run directly without installation
npx @turingdance/database-mcp

# Or specify database environment variables
DB_TYPE=mysql DB_HOST=localhost DB_USER=root DB_PASSWORD=123456 DB_NAME=test npx @turingdance/database-mcp
```

### Option 2: Local Installation

```bash
# Global installation
npm install -g @turingdance/database-mcp

# Or install in your project
npm install @turingdance/database-mcp
```

### Option 3: Run from Source

```bash
git clone https://github.com/turingdance/database-mcp.git
cd database-mcp
npm install
npm start
```

---

## Features

- **One config, seven databases** — Switch databases by changing just one env var `DB_TYPE`
- **MySQL compatible** — MariaDB and TiDB share the `mysql2` driver, zero extra dependencies
- **Sensitive operation protection** — INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER require explicit user confirmation
- **Risk-based interception** — High-risk (irreversible), medium-risk (data changes), low-risk (read-only) auto-detection
- **Parameterized queries** — SQL injection prevention
- **Dynamic driver loading** — Loads on demand for fast startup

---

## Tools

| Tool | Description | Risk Level |
|---|---|---|
| `connect_db` | Test database connection | Low |
| `list_tables` | List all tables | Low |
| `describe_table` | View table structure | Low |
| `query` | SELECT query | Low |
| `execute` | Write operations (requires confirm) | Risk-based per statement |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DB_TYPE` | Database type: `mysql` / `mariadb` / `tidb` / `postgresql` / `sqlite` / `oracle` / `sqlserver` | `sqlite` |
| `DB_HOST` | Host address | `localhost` |
| `DB_PORT` | Port | Database default |
| `DB_USER` | Username | - |
| `DB_PASSWORD` | Password | - |
| `DB_NAME` | Database name (not required for SQLite) | `mcp-db` |
| `DB_FILE` | SQLite file path (SQLite only) | `mcp.db` |

---

## Database Configuration Examples

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

Configuration is identical to MySQL — simply change `DB_TYPE` to `mariadb` or `tidb`.

---

## WorkBuddy / Claude Desktop Configuration

### Configuration File Format

Add the following to `~/.workbuddy/mcp.json` or Claude Desktop's MCP configuration file:

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

### Local Source Configuration

If using local source code:

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

## Security Mechanism

| Level | Keywords | Behavior |
|---|---|---|
| **High-risk** | DROP, TRUNCATE, ALTER | Requires `confirm: true`, logged on server |
| **Medium-risk** | INSERT, DELETE, UPDATE, REPLACE, RENAME, GRANT, REVOKE | Requires `confirm: true` |
| **Low-risk** | SELECT, SHOW, DESCRIBE, PRAGMA, etc. | Executes directly |

### Response Without Confirmation

```json
{
  "status": "rejected",
  "risk_level": "medium",
  "detected_operation": "INSERT",
  "message": "Medium-risk operation [INSERT] detected. You must pass confirm: true to execute."
}
```

### Execution With Confirmation

```json
{
  "tool": "execute",
  "arguments": {
    "sql": "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')",
    "confirm": true,
    "reason": "Test insert operation"
  }
}
```

---

## Usage Examples

### Query Database

```
List all tables
```

AI will call the `list_tables` tool.

---

```
Show the structure of the users table
```

AI will call the `describe_table` tool.

---

```
Query the first 10 rows from the users table
```

AI will call the `query` tool to execute a SELECT statement.

### Insert Data

```
Insert a record into the users table: name=John, email=john@example.com
```

AI will:

1. Attempt to execute INSERT (intercepted)
2. Prompt for confirmation
3. After you confirm, execute again (with confirm flag)

---

## Tech Stack

- Node.js (ESM) + `@modelcontextprotocol/server` v2 + zod v4
- Drivers: mysql2 (MySQL/MariaDB/TiDB) / pg / better-sqlite3 / oracledb / tedious (SQL Server)

---

## License

ISC

---

## Feedback

- GitHub Issues: https://github.com/turingdance/database-mcp/issues
- Email: 271151388@qq.com
