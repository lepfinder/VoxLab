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
        # 创建对话表（实时对话演示）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # 创建消息表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tokens INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        # 创建 LLM 供应商配置表（OpenAI 兼容）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS llm_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT NOT NULL,
                model TEXT NOT NULL,
                temperature REAL DEFAULT 0.7,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # 创建发音人配置表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS speakers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                avatar TEXT,
                system_prompt TEXT NOT NULL,
                asr_provider TEXT DEFAULT 'sensevoice',
                tts_provider TEXT DEFAULT 'kokoro',
                tts_voice TEXT NOT NULL,
                vad_provider TEXT DEFAULT 'silero',
                is_preset INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()

        # 检查并初始化预置发音人
        cursor.execute("SELECT COUNT(*) FROM speakers")
        if cursor.fetchone()[0] == 0:
            preset_speakers = [
                ("haruna", "晴奈", "治愈系日语女孩，用温暖甜美的声音和中文关心你。", "haruna", 
                 "你是一个温柔可爱的日本女孩晴奈，会用简短的中文关心用户，说话带点撒娇口吻。每次回答请控制在三句话内。", 
                 "sensevoice", "kokoro", "am_nicole", "silero", 1),
                ("alex", "Alex", "硅谷专业技术面试官，提供高强度全英文编码面试模拟。", "alex", 
                 "You are a professional software engineer interviewer. Conduct a strict coding interview. Respond concisely in English.", 
                 "sensevoice", "edge", "en-US-GuyNeural", "webrtc", 1),
                ("morpheus", "墨菲斯", "富有哲理与智慧的长者，说话语速缓慢且沉稳。", "morpheus", 
                 "你是一个充满智慧、洞察人性的哲学导师墨菲斯。你的话语简练、深邃，饱含哲理。请用中文回答。", 
                 "vosk", "edge", "zh-CN-YunxiNeural", "silero", 1)
            ]
            for sp in preset_speakers:
                cursor.execute("""
                    INSERT INTO speakers (id, name, description, avatar, system_prompt, asr_provider, tts_provider, tts_voice, vad_provider, is_preset)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, sp)
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

    # --- Conversations ---
    def create_conversation(self, conv_id: str, title: str = "新对话"):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (id, title) VALUES (?, ?)",
            (conv_id, title),
        )
        self.conn.commit()
        return self.get_conversation(conv_id)

    def get_conversation(self, conv_id: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def list_conversations(self, limit: int = 100):
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT c.*, "
            "(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count "
            "FROM conversations c ORDER BY c.updated_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def rename_conversation(self, conv_id: str, title: str):
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, conv_id),
        )
        self.conn.commit()
        return self.get_conversation(conv_id)

    def touch_conversation(self, conv_id: str):
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (conv_id,),
        )
        self.conn.commit()

    def delete_conversation(self, conv_id: str):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        self.conn.commit()

    # --- Messages ---
    def add_message(self, message_id: str, conversation_id: str, role: str, content: str, tokens: int = 0):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, conversation_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)",
            (message_id, conversation_id, role, content, tokens),
        )
        cursor.execute(
            "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (conversation_id,),
        )
        self.conn.commit()
        return self.get_message(message_id)

    def get_message(self, message_id: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def list_messages(self, conversation_id: str):
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conversation_id,),
        )
        return [dict(row) for row in cursor.fetchall()]

    def update_message(self, message_id: str, content: str, tokens: int = None):
        cursor = self.conn.cursor()
        if tokens is not None:
            cursor.execute(
                "UPDATE messages SET content = ?, tokens = ? WHERE id = ?",
                (content, tokens, message_id),
            )
        else:
            cursor.execute(
                "UPDATE messages SET content = ? WHERE id = ?",
                (content, message_id),
            )
        self.conn.commit()

    # --- LLM Configs ---
    def list_llm_configs(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM llm_configs ORDER BY created_at ASC")
        rows = [dict(row) for row in cursor.fetchall()]
        for r in rows:
            r["api_key"] = self._mask_api_key(r["api_key"])
        return rows

    def get_llm_config(self, config_id: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM llm_configs WHERE id = ?", (config_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_default_llm_config(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM llm_configs WHERE is_default = 1 LIMIT 1")
        row = cursor.fetchone()
        if not row:
            cursor.execute("SELECT * FROM llm_configs ORDER BY created_at ASC LIMIT 1")
            row = cursor.fetchone()
        return dict(row) if row else None

    def save_llm_config(self, config_id: str, name: str, base_url: str, api_key: str, model: str,
                        temperature: float = 0.7, is_default: bool = False):
        cursor = self.conn.cursor()
        if is_default:
            cursor.execute("UPDATE llm_configs SET is_default = 0")
        # 通过 base_url+name 判断是否已存在（update 模式）。如果 api_key 是脱敏占位，保留原值
        existing = self.get_llm_config(config_id) if config_id else None
        if existing and api_key.startswith("sk-") and "•" in api_key:
            api_key_to_save = existing["api_key"]
        else:
            api_key_to_save = api_key
        cursor.execute(
            """INSERT INTO llm_configs (id, name, base_url, api_key, model, temperature, is_default)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name,
                 base_url=excluded.base_url,
                 api_key=excluded.api_key,
                 model=excluded.model,
                 temperature=excluded.temperature,
                 is_default=excluded.is_default""",
            (config_id, name, base_url, api_key_to_save, model, temperature, 1 if is_default else 0),
        )
        self.conn.commit()
        return self.get_llm_config(config_id)

    def delete_llm_config(self, config_id: str):
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM llm_configs WHERE id = ?", (config_id,))
        self.conn.commit()

    # --- Speakers (发音人) ---
    def list_speakers(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM speakers ORDER BY is_preset DESC, created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

    def get_speaker(self, speaker_id: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM speakers WHERE id = ?", (speaker_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def save_speaker(self, speaker_id: str, name: str, description: str, avatar: str, system_prompt: str,
                     asr_provider: str = "sensevoice", tts_provider: str = "kokoro", tts_voice: str = "",
                     vad_provider: str = "silero", is_preset: bool = False):
        cursor = self.conn.cursor()
        cursor.execute(
            """INSERT INTO speakers (id, name, description, avatar, system_prompt, asr_provider, tts_provider, tts_voice, vad_provider, is_preset)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name,
                 description=excluded.description,
                 avatar=excluded.avatar,
                 system_prompt=excluded.system_prompt,
                 asr_provider=excluded.asr_provider,
                 tts_provider=excluded.tts_provider,
                 tts_voice=excluded.tts_voice,
                 vad_provider=excluded.vad_provider""",
            (speaker_id, name, description, avatar, system_prompt, asr_provider, tts_provider, tts_voice, vad_provider, 1 if is_preset else 0),
        )
        self.conn.commit()
        return self.get_speaker(speaker_id)

    def delete_speaker(self, speaker_id: str) -> bool:
        # 系统预置发音人不能删除
        cursor = self.conn.cursor()
        cursor.execute("SELECT is_preset FROM speakers WHERE id = ?", (speaker_id,))
        row = cursor.fetchone()
        if row and row["is_preset"] == 1:
            return False
        cursor.execute("DELETE FROM speakers WHERE id = ?", (speaker_id,))
        self.conn.commit()
        return True

    @staticmethod
    def _mask_api_key(key: str) -> str:
        if not key or len(key) < 8:
            return key
        return key[:5] + "•" * (len(key) - 9) + key[-4:]

# 全局单例
db = Database()
