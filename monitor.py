import docker
import time
from datetime import datetime

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
        # CPU calculation - more robust handling
        cpu_percent = 0.0
        cpu_stats = stats.get('cpu_stats', {})
        precpu_stats = stats.get('precpu_stats', {})

        try:
            if cpu_stats and precpu_stats:
                cpu_delta = cpu_stats['cpu_usage']['total_usage'] - precpu_stats['cpu_usage']['total_usage']
                system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)

                # Handle both old and new Docker API versions
                cpu_count = len(cpu_stats['cpu_usage'].get('percpu_usage', [1]))  # Fallback to 1 CPU if not available

                if system_delta > 0 and cpu_delta > 0:
                    cpu_percent = (cpu_delta / system_delta) * cpu_count * 100
        except KeyError as e:
            print(f"CPU calculation warning: {e}")
            cpu_percent = 0.0  # Fallback value

        # Memory calculation
        memory_stats = stats.get('memory_stats', {})
        mem_usage = memory_stats.get('usage', 0)
        mem_limit = memory_stats.get('limit', 1)  # Avoid division by zero

        return {
            'time': datetime.now().isoformat(),
            'cpu_percent': round(cpu_percent, 2),
            'memory_usage': mem_usage,
            'memory_limit': mem_limit,
            'memory_percent': round((mem_usage / mem_limit) * 100, 2) if mem_limit else 0,
            'network_io': stats.get('networks', {}),
            'pids': stats.get('pids_stats', {}).get('current', 0)
        }
