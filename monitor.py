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
        """Ensure percentages are between 0-100"""
        # CPU calculation
        cpu_percent = 0.0
        try:
            cpu_stats = stats.get('cpu_stats', {})
            precpu_stats = stats.get('precpu_stats', {})
            
            if cpu_stats and precpu_stats:
                cpu_delta = cpu_stats['cpu_usage']['total_usage'] - precpu_stats['cpu_usage']['total_usage']
                system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)
                
                if system_delta > 0 and cpu_delta > 0:
                    cpu_count = len(cpu_stats['cpu_usage'].get('percpu_usage', [1]))
                    cpu_percent = min(100, max(0, (cpu_delta / system_delta) * cpu_count * 100))
        except Exception:
            cpu_percent = 0.0
    
        # Memory calculation
        memory_stats = stats.get('memory_stats', {})
        mem_usage = memory_stats.get('usage', 0)
        mem_limit = memory_stats.get('limit', 1)
        mem_percent = min(100, max(0, (mem_usage / mem_limit) * 100)) if mem_limit else 0
    
        return {
            'time': datetime.now().isoformat(),
            'cpu_percent': round(cpu_percent, 2),
            'memory_usage': mem_usage,
            'memory_limit': mem_limit,
            'memory_percent': round(mem_percent, 2),
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
        """Return both access and error logs in structured format"""
        try:
            container = self.client.containers.get(container_id)
            logs = container.logs(
                tail=tail,
                timestamps=True,
                follow=False
            ).decode('utf-8', errors='replace').split('\n')
    
            # Improved log filtering
            access_logs = []
            error_logs = []
            
            for log in logs:
                if not log.strip():
                    continue
                if 'error' in log.lower() or 'exception' in log.lower() or 'fail' in log.lower():
                    error_logs.append(log)
                else:
                    access_logs.append(log)
    
            return {
                'access': access_logs[-tail:],  # Return only the requested number of lines
                'error': error_logs[-tail:],
                'raw': logs[-tail:]
            }
        except Exception as e:
            return {
                'error': str(e),
                'access': [],
                'error': []
            }
