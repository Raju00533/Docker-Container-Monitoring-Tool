# db.py
import sqlite3
from datetime import datetime, timedelta
import logging

DB_NAME = "monitor.db"
logger = logging.getLogger(__name__)

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

    # Create indexes
    c.execute('CREATE INDEX IF NOT EXISTS idx_container_stats_time ON container_stats(timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_container_stats_container ON container_stats(container_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_network_stats_time ON network_stats(timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_network_stats_container ON network_stats(container_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_container_logs_time ON container_logs(timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_container_logs_container ON container_logs(container_id)')

    # Add data retention triggers
    c.execute('''CREATE TRIGGER IF NOT EXISTS container_stats_retention
                 AFTER INSERT ON container_stats
                 BEGIN
                     DELETE FROM container_stats WHERE timestamp < datetime('now', '-30 days');
                 END''')
    
    c.execute('''CREATE TRIGGER IF NOT EXISTS network_stats_retention
                 AFTER INSERT ON network_stats
                 BEGIN
                     DELETE FROM network_stats WHERE timestamp < datetime('now', '-30 days');
                 END''')
    
    c.execute('''CREATE TRIGGER IF NOT EXISTS container_logs_retention
                 AFTER INSERT ON container_logs
                 BEGIN
                     DELETE FROM container_logs WHERE timestamp < datetime('now', '-7 days');
                 END''')

    conn.commit()
    conn.close()

def insert_container_stats(container_id, stats):
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute('''INSERT INTO container_stats 
            (container_id, timestamp, cpu_percent, memory_usage, memory_limit, memory_percent, pids)
            VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (container_id, stats['time'], stats['cpu_percent'], stats['memory_usage'],
             stats['memory_limit'], stats['memory_percent'], stats['pids'])
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Error inserting container stats: {str(e)}")
    finally:
        conn.close()

def insert_network_stats(container_id, timestamp, network):
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute('''INSERT INTO network_stats 
            (container_id, timestamp, rx_bytes, tx_bytes)
            VALUES (?, ?, ?, ?)''',
            (container_id, timestamp, network.get('rx_bytes', 0), network.get('tx_bytes', 0))
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Error inserting network stats: {str(e)}")
    finally:
        conn.close()

def insert_logs(container_id, timestamp, logs):
    try:
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
    except Exception as e:
        logger.error(f"Error inserting logs: {str(e)}")
    finally:
        conn.close()

def get_historical_stats(container_id, time_range, resolution='1m'):
    """Get historical stats for a container within the specified time range with resolution"""
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # Calculate the start time based on the time range
        end_time = datetime.now()
        if time_range == '1h':
            start_time = end_time - timedelta(hours=1)
        elif time_range == '6h':
            start_time = end_time - timedelta(hours=6)
        elif time_range == '12h':
            start_time = end_time - timedelta(hours=12)
        elif time_range == '24h':
            start_time = end_time - timedelta(hours=24)
        elif time_range == '7d':
            start_time = end_time - timedelta(days=7)
        else:
            start_time = end_time - timedelta(hours=1)  # Default to 1 hour
        
        # Calculate resolution in minutes
        resolution_minutes = int(resolution[:-1]) if resolution.endswith('m') else 60
        
        # Query container stats with resolution
        c.execute('''SELECT 
                    strftime('%Y-%m-%d %H:%M', timestamp) as time_bucket,
                    AVG(cpu_percent) as avg_cpu,
                    AVG(memory_percent) as avg_memory,
                    MAX(pids) as max_pids
                FROM container_stats
                WHERE container_id = ? AND timestamp >= ?
                GROUP BY time_bucket
                ORDER BY time_bucket''',
                (container_id, start_time.isoformat()))
        stats = c.fetchall()
        
        # Query network stats with resolution
        c.execute('''SELECT 
                    strftime('%Y-%m-%d %H:%M', timestamp) as time_bucket,
                    MAX(rx_bytes) as max_rx,
                    MAX(tx_bytes) as max_tx
                FROM network_stats
                WHERE container_id = ? AND timestamp >= ?
                GROUP BY time_bucket
                ORDER BY time_bucket''',
                (container_id, start_time.isoformat()))
        network = c.fetchall()
        
        return {
            'stats': [{
                'time': row[0],
                'cpu_percent': row[1],
                'memory_percent': row[2],
                'pids': row[3]
            } for row in stats],
            'network': [{
                'time': row[0],
                'rx_bytes': row[1],
                'tx_bytes': row[2]
            } for row in network]
        }
    except Exception as e:
        logger.error(f"Error getting historical stats: {str(e)}")
        return {'stats': [], 'network': []}
    finally:
        conn.close()

def get_historical_logs(container_id, time_range, page=1, per_page=100):
    """Get historical logs for a container with pagination"""
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # Calculate the start time based on the time range
        end_time = datetime.now()
        if time_range == '1h':
            start_time = end_time - timedelta(hours=1)
        elif time_range == '6h':
            start_time = end_time - timedelta(hours=6)
        elif time_range == '12h':
            start_time = end_time - timedelta(hours=12)
        elif time_range == '24h':
            start_time = end_time - timedelta(hours=24)
        elif time_range == '7d':
            start_time = end_time - timedelta(days=7)
        else:
            start_time = end_time - timedelta(hours=1)  # Default to 1 hour
        
        # Calculate offset for pagination
        offset = (page - 1) * per_page
        
        # Get total count for pagination
        c.execute('''SELECT COUNT(*) FROM container_logs
                    WHERE container_id = ? AND timestamp >= ?''',
                    (container_id, start_time.isoformat()))
        total_count = c.fetchone()[0]
        
        # Query logs with pagination
        c.execute('''SELECT timestamp, log_type, message
                    FROM container_logs
                    WHERE container_id = ? AND timestamp >= ?
                    ORDER BY timestamp DESC
                    LIMIT ? OFFSET ?''',
                    (container_id, start_time.isoformat(), per_page, offset))
        logs = c.fetchall()
        
        # Organize logs by type
        result = {
            'access': [],
            'error': [],
            'raw': [],
            'pagination': {
                'total': total_count,
                'page': page,
                'per_page': per_page,
                'total_pages': (total_count + per_page - 1) // per_page
            }
        }
        
        for timestamp, log_type, message in logs:
            if log_type in result:
                result[log_type].append(message)
        
        return result
    except Exception as e:
        logger.error(f"Error getting historical logs: {str(e)}")
        return {'access': [], 'error': [], 'raw': [], 'pagination': {'total': 0, 'page': 1, 'per_page': per_page, 'total_pages': 0}}
    finally:
        conn.close()

