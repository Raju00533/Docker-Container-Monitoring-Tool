from flask import Flask, jsonify, render_template
from monitor import DockerMonitor
import threading
import time
import os

app = Flask(__name__, template_folder='./frontend/templates', static_folder='./frontend/static')
monitor = DockerMonitor()

# In-memory storage for container data
container_data = {
    'containers': [],
    'stats': {},
    'system_info': {}
}

def background_monitor():
    """Background thread to update container data"""
    while True:
        try:
            # Update container list
            container_data['containers'] = [
                {'id': c.id, 'name': c.name, 'status': c.status, 
                 'image': c.image.tags[0] if c.image.tags else c.image.id}
                for c in monitor.get_containers()
            ]
            
            # Update stats for each container
            for container in container_data['containers']:
                stats = monitor.get_container_stats(container['id'])
                container_data['stats'][container['id']] = monitor.format_stats(stats)
            
            # Update system info
            container_data['system_info'] = monitor.get_system_info()
            
        except Exception as e:
            print(f"Monitoring error: {e}")
        
        time.sleep(2)  # Update interval

@app.route('/api/containers')
def get_containers():
    return jsonify(container_data['containers'])

@app.route('/api/stats/<container_id>')
def get_stats(container_id):
    return jsonify(container_data['stats'].get(container_id, {}))

@app.route('/api/system')
def get_system():
    return jsonify(container_data['system_info'])


@app.route('/')
def index():
    return render_template('index.html')



if __name__ == '__main__':
    # Start background monitoring thread
    thread = threading.Thread(target=background_monitor)
    thread.daemon = True
    thread.start()
    
    app.run(host='0.0.0.0', port=8000, debug=True)
