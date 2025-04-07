import docker
from datetime import datetime
import re

class DockerMonitor:
    def __init__(self):
        self.client = docker.from_env()

    def get_containers(self):
        """Get list of all containers"""
        return self.client.containers.list(all=True)

    def get_container_stats(self, container_id):
        """Get real-time stats for a container"""
        container = self.client.containers.get(container_id)
        return container.stats(stream=False)

    def get_system_info(self):
        """Get Docker system information"""
        return self.client.info()

    def format_stats(self, stats):
        """Format raw stats into human-readable format"""
        # Existing CPU and memory calculations remain the same
        # ... [keep existing CPU and memory code] ...

        return {
            'time': datetime.now().isoformat(),
            'cpu_percent': round(cpu_percent, 2),
            'memory_usage': mem_usage,
            'memory_limit': mem_limit,
            'memory_percent': round((mem_usage / mem_limit) * 100, 2) if mem_limit else 0,
            'pids': stats.get('pids_stats', {}).get('current', 0)
        }

    def get_network_io(self, stats):
        """Calculate total RX/TX bytes across all interfaces with better error handling"""
        try:
            networks = stats.get("networks", {})
            
            # Fallback for different network key structures
            if not networks and 'network' in stats:
                networks = stats['network']
            
            rx = sum(n.get("rx_bytes", 0) for n in networks.values())
            tx = sum(n.get("tx_bytes", 0) for n in networks.values())
            return {"rx_bytes": rx, "tx_bytes": tx}
        except Exception as e:
            print(f"Network IO Error: {str(e)}")
            return {"rx_bytes": 0, "tx_bytes": 0, "error": str(e)}

    def get_container_logs(self, container_id, tail=100):
        """Improved log retrieval with better filtering and error handling"""
        try:
            container = self.client.containers.get(container_id)
            
            # Get logs with timestamps
            logs = container.logs(
                tail=tail,
                timestamps=True,
                follow=False
            ).decode('utf-8', errors='replace').split('\n')

            # Improved regex patterns
            access_pattern = re.compile(r'("GET|POST|PUT|DELETE|HEAD)\s+.*HTTP/\d\.\d"\s+(2\d{2}|3\d{2})')
            error_pattern = re.compile(r'(error|exception|fail|5\d{2}|segfault|alert|critical)', re.IGNORECASE)

            return {
                'access': [log for log in logs if access_pattern.search(log)],
                'error': [log for log in logs if error_pattern.search(log)],
                'raw': logs
            }
        except Exception as e:
            print(f"Log Retrieval Error: {str(e)}")
            return {'error': str(e)}
