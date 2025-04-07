from flask import Flask, jsonify, render_template
from monitor import DockerMonitor
import threading
import time

app = Flask(__name__, template_folder='./frontend/templates', static_folder='./frontend/static')
monitor = DockerMonitor()

# In-memory storage for container data
container_data = {
    'containers': [],
    'stats': {},
    'network': {},
    'system_info': {},
    'logs': {}
}

def background_monitor():
    """Background thread to update container data"""
    while True:
        try:
            # Update container list
            containers = monitor.get_containers()
            container_data['containers'] = [
                {
                    'id': c.id,
                    'name': c.name,
                    'status': c.status,
                    'image': c.image.tags[0] if c.image.tags else c.image.id
                }
                for c in containers
            ]

            # Update stats, network, and logs for each container
            for container in container_data['containers']:
                try:
                    # Get fresh stats for each container
                    raw_stats = monitor.get_container_stats(container['id'])
                    
                    # Process and store stats
                    formatted_stats = monitor.format_stats(raw_stats)
                    container_data['stats'][container['id']] = formatted_stats
                    
                    # Process and store network data
                    network_stats = monitor.get_network_io(raw_stats)
                    container_data['network'][container['id']] = network_stats
                    
                    # Store logs (update less frequently to reduce load)
                    if time.time() % 10 < 2:  # Update logs every 10 seconds
                        container_logs = monitor.get_container_logs(container['id'])
                        container_data['logs'][container['id']] = container_logs

                except Exception as e:
                    print(f"Error updating container {container['id']}: {str(e)}")

            # Update system info
            container_data['system_info'] = monitor.get_system_info()

        except Exception as e:
            print(f"Monitoring error: {str(e)}")

        time.sleep(2)  # Update interval

@app.route('/api/containers')
def get_containers():
    return jsonify(container_data['containers'])

@app.route('/api/stats/<container_id>')
def get_stats(container_id):
    return jsonify(container_data['stats'].get(container_id, {}))

@app.route('/api/network/<container_id>')
def get_network(container_id):
    return jsonify(container_data['network'].get(container_id, {}))

@app.route('/api/system')
def get_system():
    return jsonify(container_data['system_info'])

@app.route('/api/logs/<container_id>')
def get_logs(container_id):
    logs = container_data['logs'].get(container_id, {})
    return jsonify({
        'access': logs.get('access', []),
        'error': logs.get('error', []),
        'raw': logs.get('raw', [])
    })

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # Start background monitoring thread
    thread = threading.Thread(target=background_monitor)
    thread.daemon = True
    thread.start()
    app.run(host='0.0.0.0', port=8000, debug=True)
