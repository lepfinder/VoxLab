import sqlite3
import os
import time
import uuid
import logging

logger = logging.getLogger(__name__)

DB_PATH = "data/server.db"

class Database:
    def __init__(self):
        os.makedirs("data", exist_ok=True)
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        # 创建 Token 表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                name TEXT,
                status INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # 创建调用日志表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT,
                model TEXT,
                endpoint TEXT,
                status_code INTEGER,
                duration REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()

        # 动态增加缺失的列 (简单的数据库迁移逻辑)
        cursor.execute("PRAGMA table_info(usage_logs)")
        columns = [column[1] for column in cursor.fetchall()]
        new_columns = [
            ("prompt_tokens", "INTEGER DEFAULT 0"),
            ("completion_tokens", "INTEGER DEFAULT 0"),
            ("total_tokens", "INTEGER DEFAULT 0")
        ]
        for col_name, col_type in new_columns:
            if col_name not in columns:
                logger.info(f"Adding column {col_name} to usage_logs table...")
                cursor.execute(f"ALTER TABLE usage_logs ADD COLUMN {col_name} {col_type}")
        
        self.conn.commit()
        
        # 检查是否需要初始化默认 Token
        cursor.execute("SELECT COUNT(*) FROM tokens")
        if cursor.fetchone()[0] == 0:
            default_token = f"sk-{uuid.uuid4().hex[:12]}"
            cursor.execute("INSERT INTO tokens (token, name) VALUES (?, ?)", (default_token, "Default Admin"))
            self.conn.commit()
            print("\n" + "="*50)
            print(f"INITIALIZED DEFAULT TOKEN: {default_token}")
            print("="*50 + "\n")

    def verify_token(self, token: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("SELECT status FROM tokens WHERE token = ?", (token,))
        result = cursor.fetchone()
        return result is not None and result["status"] == 1

    def log_usage(self, token: str, model: str, endpoint: str, status_code: int, duration: float, 
                  prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0):
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO usage_logs (token, model, endpoint, status_code, duration, prompt_tokens, completion_tokens, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (token, model, endpoint, status_code, duration, prompt_tokens, completion_tokens, total_tokens))
        self.conn.commit()

    def get_all_tokens(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM tokens ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

    def add_token(self, name: str):
        new_token = f"sk-{uuid.uuid4().hex[:12]}"
        cursor = self.conn.cursor()
        cursor.execute("INSERT INTO tokens (token, name) VALUES (?, ?)", (new_token, name))
        self.conn.commit()
        return new_token

    def delete_token(self, token: str):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM tokens WHERE token = ?", (token,))
        self.conn.commit()

    def get_usage_logs(self, limit: int = 100):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT ?", (limit,))
        return [dict(row) for row in cursor.fetchall()]

    def get_stats(self):
        """获取简单的统计信息"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) as count, SUM(total_tokens) as tokens FROM usage_logs")
        row = cursor.fetchone()
        return dict(row)

# 全局单例
db = Database()
