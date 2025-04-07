import docker
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
        # CPU calculation
        cpu_percent = 0.0
        cpu_stats = stats.get('cpu_stats', {})
        precpu_stats = stats.get('precpu_stats', {})

        try:
            if cpu_stats and precpu_stats:
                cpu_delta = cpu_stats['cpu_usage']['total_usage'] - precpu_stats['cpu_usage']['total_usage']
                system_delta = cpu_stats.get('system_cpu_usage', 0) - precpu_stats.get('system_cpu_usage', 0)

                cpu_count = len(cpu_stats['cpu_usage'].get('percpu_usage', [1]))

                if system_delta > 0 and cpu_delta > 0:
                    cpu_percent = (cpu_delta / system_delta) * cpu_count * 100
        except KeyError as e:
            print(f"CPU calculation warning: {e}")
            cpu_percent = 0.0

        # Memory usage
        memory_stats = stats.get('memory_stats', {})
        mem_usage = memory_stats.get('usage', 0)
        mem_limit = memory_stats.get('limit', 1)

        return {
            'time': datetime.now().isoformat(),
            'cpu_percent': round(cpu_percent, 2),
            'memory_usage': mem_usage,
            'memory_limit': mem_limit,
            'memory_percent': round((mem_usage / mem_limit) * 100, 2) if mem_limit else 0,
            'network_io': stats.get('networks', {}),
            'pids': stats.get('pids_stats', {}).get('current', 0)
        }

    def get_network_io(self, stats):
        """Calculate total RX/TX bytes across all interfaces"""
        try:
            networks = stats.get("networks", {})
            rx = sum(n.get("rx_bytes", 0) for n in networks.values())
            tx = sum(n.get("tx_bytes", 0) for n in networks.values())
            return {"rx_bytes": rx, "tx_bytes": tx}
        except Exception as e:
            return {"rx_bytes": 0, "tx_bytes": 0, "error": str(e)}

    def get_container_logs(self, container_id, log_type="access", tail=100):
        """Return access or error logs"""
        try:
            container = self.client.containers.get(container_id)
            logs = container.logs(tail=tail).decode().splitlines()

            # Basic pattern filter (can be improved per container type)
            access_logs = [line for line in logs if "GET" in line or "POST" in line or "200" in line]
            error_logs = [line for line in logs if "error" in line.lower() or "500" in line or "fail" in line.lower()]

            return access_logs if log_type == "access" else error_logs
        except Exception as e:
            return [f"Error retrieving logs: {str(e)}"]
