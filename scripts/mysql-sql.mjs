/**
 * Turn the app's Postgres-shaped SQL into MariaDB / MySQL.
 * Preview still runs the original statements on PGLite. Plesk uses this.
 */

export function isMysqlUrl(url) {
  return typeof url === "string" && /^mysql2?:\/\//i.test(url.trim());
}

const IGNORABLE = new Set([1050, 1060, 1061]);

export function isIgnorableMysqlError(err) {
  return IGNORABLE.has(err?.errno) || IGNORABLE.has(err?.code);
}

export function splitSql(sql) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (quote) {
      cur += c;
      if (c === quote && sql[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-" && !cur.trim()) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (c === ";") {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function quotesToBackticks(sql) {
  return sql.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "`$1`");
}

function translateUpdateFrom(sql) {
  const match = sql.match(
    /update\s+profiles\s+as\s+bot\s+set\s+([\s\S]+?)\s+from\s+profiles\s+as\s+player\s+where\s+([\s\S]+)/i,
  );
  if (!match) return sql;
  const parts = match[2]
    .trim()
    .replace(/;?\s*$/, "")
    .split(/\s+and\s+/i);
  const on = parts.filter((part) => /^\s*player\./i.test(part));
  const where = parts.filter((part) => !/^\s*player\./i.test(part));
  const assignment = match[1].trim().replace(/^\s*score\s*=/i, "bot.score =");
  return (
    `update profiles as bot join profiles as player on ${on.join(" and ") || "1=1"} ` +
    `set ${assignment}` +
    (where.length ? ` where ${where.join(" and ")}` : "")
  );
}

function translateConflict(sql) {
  if (/on conflict\s*\([^)]+\)\s*do nothing/i.test(sql)) {
    return sql
      .replace(/\s+on conflict\s*\([^)]+\)\s*do nothing\s*/i, " ")
      .replace(/\binsert\s+into\b/i, "insert ignore into")
      .trim();
  }
  const match = sql.match(/^([\s\S]*?)\bon conflict\s*\([^)]+\)\s*do update\s+set\s+([\s\S]+)$/i);
  if (!match) return sql;
  const assignments = match[2]
    .split(",")
    .map((part) => {
      const eq = part.indexOf("=");
      const col = part.slice(0, eq).trim();
      const expr = part
        .slice(eq + 1)
        .trim()
        .replace(/excluded\.([A-Za-z_][A-Za-z0-9_]*)/gi, "values($1)");
      return `${col} = ${expr}`;
    })
    .join(", ");
  return `${match[1].trim()}\non duplicate key update ${assignments}`;
}

function translateTypes(sql) {
  let text = sql;
  text = text.replace(/\btimestamptz\b/gi, "datetime(3)");
  text = text.replace(
    /\bdatetime\(3\)([^,\n]*?)\bdefault\s+(?:current_timestamp|now\(\))/gi,
    "datetime(3)$1default current_timestamp(3)",
  );
  text = text.replace(/\bjsonb\b/gi, "json");
  text = text.replace(/\bbigserial\b/gi, "bigint not null auto_increment");
  text = text.replace(/\bserial\b/gi, "int not null auto_increment");
  text = text.replace(/\bboolean\s+not\s+null\s+default\s+false\b/gi, "tinyint(1) not null default 0");
  text = text.replace(/\bboolean\s+not\s+null\s+default\s+true\b/gi, "tinyint(1) not null default 1");
  text = text.replace(/\bboolean\b/gi, "tinyint(1)");
  text = text.replace(/\balter\s+column\s+([A-Za-z_][A-Za-z0-9_]*)\s+set\s+default\b/gi, "alter $1 set default");
  text = text.replace(/(\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\))::int\b/gi, "cast($1 as signed)");
  text = text.replace(/\bnow\(\)\s*-\s*interval\s+'(\d+)\s+seconds?'/gi, "date_sub(now(), interval $1 second)");
  text = text.replace(
    /in\s*\(\s*select\s+user_id\s+from\s+profiles\s+where\s+username_lc\s+in\s*\('ivoryrock',\s*'ivoryrook'\)\s*\)/gi,
    "in (select user_id from (select user_id from profiles where username_lc in ('ivoryrock', 'ivoryrook')) ivory_ids)",
  );
  text = text.replace(/\btext\b/gi, "varchar(255)");
  text = text.replace(
    /("?)(body|payload|fen|image|password|accessToken|refreshToken|idToken|userAgent|value|scope)\1\s+varchar\(255\)/gi,
    "$1$2$1 mediumtext",
  );
  text = text.replace(/("?)owned_boards\1\s+varchar\(255\)/gi, "$1owned_boards$1 varchar(1024)");
  return text;
}

function placeholder(sql, params) {
  const ordered = [];
  const text = sql.replace(/\$(\d+)/g, (_, n) => {
    ordered.push(params[Number(n) - 1]);
    return "?";
  });
  return { sql: text, params: ordered.map(normalizeParam) };
}

function normalizeParam(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return value.replace("T", " ").replace(/Z$/, "");
  }
  return value;
}

function returningValue(sql, params, column) {
  const whereAt = sql.toLowerCase().lastIndexOf(" where ");
  if (whereAt < 0) return undefined;
  const re = new RegExp(`\\b${column}\\s*=\\s*\\?`, "i");
  const where = sql.slice(whereAt);
  const found = where.match(re);
  if (!found || found.index == null) return undefined;
  const before = sql.slice(0, whereAt + found.index);
  const index = (before.match(/\?/g) || []).length;
  return params[index];
}

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {{ sql: string, params: unknown[], returning: string | null, returningValue: unknown }}
 */
export function prepareMysql(sql, params = []) {
  let text = translateUpdateFrom(sql.trim());
  text = translateConflict(text);
  const returningMatch = text.match(/\s+returning\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i);
  const returning = returningMatch ? returningMatch[1] : null;
  if (returningMatch) text = text.slice(0, returningMatch.index).trim();
  text = translateTypes(text);
  text = quotesToBackticks(text);
  const placed = placeholder(text, params);
  return {
    sql: placed.sql,
    params: placed.params,
    returning,
    returningValue: returning ? returningValue(placed.sql, placed.params, returning) : undefined,
  };
}

export function rowsFromMysql(result, prepared) {
  if (prepared.returning) {
    const affected = result?.affectedRows ?? 0;
    if (!affected) return [];
    return [{ [prepared.returning]: prepared.returningValue }];
  }
  return Array.isArray(result) ? result : [];
}

export async function runMysqlStatement(query, sql, params = []) {
  const prepared = prepareMysql(sql, params);
  const attempt = (text) => query(text, prepared.params);
  try {
    return rowsFromMysql(await attempt(prepared.sql), prepared);
  } catch (err) {
    if (err?.errno === 1064 && /if not exists/i.test(prepared.sql)) {
      try {
        return rowsFromMysql(await attempt(prepared.sql.replace(/\s+if not exists/gi, "")), prepared);
      } catch (retry) {
        if (isIgnorableMysqlError(retry)) return [];
        throw retry;
      }
    }
    if (isIgnorableMysqlError(err)) return [];
    throw err;
  }
}

