from flask import Flask, jsonify, request
from flask_cors import CORS
import docker
from datetime import datetime
import time
import threading
import json
from monitor import DockerMonitor
from db import init_db, insert_container_stats, insert_network_stats, insert_logs, get_historical_stats, get_historical_logs
import logging
from functools import lru_cache
import os

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Docker monitor and database
monitor = DockerMonitor()
init_db()

# In-memory storage for current container data
containers_data = {}
stats_data = {}
network_data = {}
logs_data = {}

# Cache for frequently accessed data
@lru_cache(maxsize=100)
def get_cached_container_data(container_id):
    return containers_data.get(container_id)

@lru_cache(maxsize=100)
def get_cached_stats(container_id):
    return stats_data.get(container_id)

@lru_cache(maxsize=100)
def get_cached_network(container_id):
    return network_data.get(container_id)

@lru_cache(maxsize=100)
def get_cached_logs(container_id):
    return logs_data.get(container_id)

def background_monitor():
    """Background thread to monitor containers"""
    while True:
        try:
            containers = monitor.get_containers()
            for container in containers:
                container_id = container.id
                containers_data[container_id] = {
                    'id': container_id,
                    'name': container.name,
                    'status': container.status,
                    'image': container.image.tags[0] if container.image.tags else 'untagged'
                }
                
                # Get and store stats
                stats = monitor.get_container_stats(container_id)
                formatted_stats = monitor.format_stats(stats)
                stats_data[container_id] = formatted_stats
                insert_container_stats(container_id, formatted_stats)
                
                # Get and store network stats
                network = monitor.get_network_io(stats)
                network_data[container_id] = network
                insert_network_stats(container_id, formatted_stats['time'], network)
                
                # Get and store logs
                logs = monitor.get_container_logs(container_id)
                logs_data[container_id] = logs
                insert_logs(container_id, formatted_stats['time'], logs)
                
            time.sleep(5)  # Update every 5 seconds
        except Exception as e:
            logger.error(f"Error in background monitoring: {str(e)}")
            time.sleep(10)  # Wait longer on error

@app.route('/api/containers', methods=['GET'])
def get_containers():
    """Get list of all containers"""
    try:
        return jsonify(list(containers_data.values()))
    except Exception as e:
        logger.error(f"Error getting containers: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/containers/<container_id>/stats', methods=['GET'])
def get_stats(container_id):
    """Get stats for a specific container"""
    try:
        time_range = request.args.get('timeRange', '1h')
        if time_range != '1h':
            # Get historical data
            resolution = request.args.get('resolution', '1m')
            return jsonify(get_historical_stats(container_id, time_range, resolution))
        
        # Get current stats
        stats = get_cached_stats(container_id)
        if not stats:
            return jsonify({'error': 'Container not found'}), 404
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting stats: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/containers/<container_id>/network', methods=['GET'])
def get_network(container_id):
    """Get network stats for a specific container"""
    try:
        time_range = request.args.get('timeRange', '1h')
        if time_range != '1h':
            # Get historical data
            resolution = request.args.get('resolution', '1m')
            return jsonify(get_historical_stats(container_id, time_range, resolution)['network'])
        
        # Get current network stats
        network = get_cached_network(container_id)
        if not network:
            return jsonify({'error': 'Container not found'}), 404
        return jsonify(network)
    except Exception as e:
        logger.error(f"Error getting network stats: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/containers/<container_id>/logs', methods=['GET'])
def get_logs(container_id):
    """Get logs for a specific container"""
    try:
        time_range = request.args.get('timeRange', '1h')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 100))
        
        if time_range != '1h':
            # Get historical logs with pagination
            return jsonify(get_historical_logs(container_id, time_range, page, per_page))
        
        # Get current logs
        logs = get_cached_logs(container_id)
        if not logs:
            return jsonify({'error': 'Container not found'}), 404
        
        # Apply pagination to current logs
        start = (page - 1) * per_page
        end = start + per_page
        paginated_logs = {
            'access': logs['access'][start:end],
            'error': logs['error'][start:end],
            'raw': logs['raw'][start:end],
            'pagination': {
                'total': len(logs['raw']),
                'page': page,
                'per_page': per_page,
                'total_pages': (len(logs['raw']) + per_page - 1) // per_page
            }
        }
        return jsonify(paginated_logs)
    except Exception as e:
        logger.error(f"Error getting logs: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/system', methods=['GET'])
def get_system_info():
    """Get Docker system information"""
    try:
        return jsonify(monitor.get_system_info())
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Start background monitoring thread
    monitor_thread = threading.Thread(target=background_monitor)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    # Start Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)
