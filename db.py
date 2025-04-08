# db.py
import sqlite3
from datetime import datetime

DB_NAME = "monitor.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()

    # Table for container stats
    c.execute('''CREATE TABLE IF NOT EXISTS container_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT,
        timestamp TEXT,
        cpu_percent REAL,
        memory_usage INTEGER,
        memory_limit INTEGER,
        memory_percent REAL,
        pids INTEGER
    )''')

    # Table for network stats
    c.execute('''CREATE TABLE IF NOT EXISTS network_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT,
        timestamp TEXT,
        rx_bytes INTEGER,
        tx_bytes INTEGER
    )''')

    # Table for logs
    c.execute('''CREATE TABLE IF NOT EXISTS container_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_id TEXT,
        timestamp TEXT,
        log_type TEXT,  -- 'access', 'error', or 'raw'
        message TEXT
    )''')

    conn.commit()
    conn.close()

def insert_container_stats(container_id, stats):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''INSERT INTO container_stats 
        (container_id, timestamp, cpu_percent, memory_usage, memory_limit, memory_percent, pids)
        VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (container_id, stats['time'], stats['cpu_percent'], stats['memory_usage'],
         stats['memory_limit'], stats['memory_percent'], stats['pids'])
    )
    conn.commit()
    conn.close()

def insert_network_stats(container_id, timestamp, network):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute('''INSERT INTO network_stats 
        (container_id, timestamp, rx_bytes, tx_bytes)
        VALUES (?, ?, ?, ?)''',
        (container_id, timestamp, network.get('rx_bytes', 0), network.get('tx_bytes', 0))
    )
    conn.commit()
    conn.close()

def insert_logs(container_id, timestamp, logs):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    for log_type in ['access', 'error', 'raw']:
        for message in logs.get(log_type, []):
            c.execute('''INSERT INTO container_logs 
                (container_id, timestamp, log_type, message)
                VALUES (?, ?, ?, ?)''',
                (container_id, timestamp, log_type, message)
            )
    conn.commit()
    conn.close()

