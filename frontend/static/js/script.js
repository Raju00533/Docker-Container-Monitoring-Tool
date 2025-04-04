document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const containersList = document.getElementById('containers-list');
    const statsContainer = document.getElementById('stats-container');
    const systemInfo = document.getElementById('system-info');
    const refreshTime = document.getElementById('refresh-time');
    const cpuChartCtx = document.getElementById('cpu-chart').getContext('2d');
    const memoryChartCtx = document.getElementById('memory-chart').getContext('2d');
    
    // Chart instances
    let cpuChart, memoryChart;
    let currentContainerId = null;
    const historyData = {};
    
    // Initialize charts
    initCharts();
    
    // Start polling data
    setInterval(fetchData, 2000);
    fetchData(); // Initial fetch
    
    function fetchData() {
        updateRefreshTime();
        
        // Fetch containers
        fetch('/api/containers')
            .then(response => response.json())
            .then(containers => {
                renderContainers(containers);
                if (containers.length > 0) {
                    // If no container is selected or the selected container no longer exists
                    if (!currentContainerId || !containers.find(c => c.id === currentContainerId)) {
                        currentContainerId = containers[0].id;
                    }
                    fetchStats(currentContainerId);
                }
            })
            .catch(error => console.error('Error fetching containers:', error));
        
        // Fetch system info
        fetch('/api/system')
            .then(response => response.json())
            .then(system => renderSystemInfo(system))
            .catch(error => console.error('Error fetching system info:', error));
    }
    
    function fetchStats(containerId) {
        currentContainerId = containerId;
        fetch(`/api/stats/${containerId}`)
            .then(response => response.json())
            .then(stats => {
                renderStats(stats);
                updateHistory(containerId, stats);
                updateCharts();
            })
            .catch(error => console.error('Error fetching stats:', error));
    }
    
    function renderContainers(containers) {
        containersList.innerHTML = containers.map(container => `
            <div class="container-item ${container.id === currentContainerId ? 'active' : ''}" 
                 onclick="fetchStats('${container.id}')">
                <div class="container-header">
                    <span class="status-indicator ${container.status}"></span>
                    <span class="container-name">${container.name}</span>
                </div>
                <span class="container-image">${container.image}</span>
                <span class="container-status">${container.status}</span>
            </div>
        `).join('');
    }
    
    function renderStats(stats) {
        statsContainer.innerHTML = `
            <h3>Real-time Statistics</h3>
            <div class="stat-item">
                <label>CPU Usage:</label>
                <div class="progress-bar">
                    <div class="progress" style="width: ${stats.cpu_percent}%; 
                        background-color: ${getUsageColor(stats.cpu_percent)}"></div>
                    <span>${stats.cpu_percent}%</span>
                </div>
            </div>
            <div class="stat-item">
                <label>Memory Usage:</label>
                <div class="progress-bar">
                    <div class="progress" style="width: ${stats.memory_percent}%; 
                        background-color: ${getUsageColor(stats.memory_percent)}"></div>
                    <span>${formatBytes(stats.memory_usage)} / ${formatBytes(stats.memory_limit)} (${stats.memory_percent}%)</span>
                </div>
            </div>
            <div class="stat-item">
                <label>Processes:</label>
                <span>${stats.pids}</span>
            </div>
            <div class="stat-item">
                <label>Last Updated:</label>
                <span>${new Date(stats.time).toLocaleTimeString()}</span>
            </div>
        `;
    }
    
    function renderSystemInfo(system) {
        systemInfo.innerHTML = `
            <h3>Docker System Information</h3>
            <div class="system-grid">
                <div class="system-item">
                    <label>Containers:</label>
                    <span>${system.ContainersRunning} running / ${system.Containers} total</span>
                </div>
                <div class="system-item">
                    <label>Images:</label>
                    <span>${system.Images}</span>
                </div>
                <div class="system-item">
                    <label>Docker Version:</label>
                    <span>${system.ServerVersion}</span>
                </div>
                <div class="system-item">
                    <label>OS:</label>
                    <span>${system.OperatingSystem}</span>
                </div>
                <div class="system-item">
                    <label>Hostname:</label>
                    <span>${system.Name}</span>
                </div>
                <div class="system-item">
                    <label>Memory:</label>
                    <span>${formatBytes(system.MemTotal)}</span>
                </div>
            </div>
        `;
    }
    
    function initCharts() {
        cpuChart = new Chart(cpuChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Usage %',
                    data: [],
                    borderColor: 'rgba(52, 152, 219, 1)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
        
        memoryChart = new Chart(memoryChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Memory Usage %',
                    data: [],
                    borderColor: 'rgba(46, 204, 113, 1)',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }
    
    function updateHistory(containerId, stats) {
        if (!historyData[containerId]) {
            historyData[containerId] = {
                timestamps: [],
                cpu: [],
                memory: []
            };
        }
        
        const history = historyData[containerId];
        const now = new Date(stats.time);
        
        history.timestamps.push(now.toLocaleTimeString());
        history.cpu.push(stats.cpu_percent);
        history.memory.push(stats.memory_percent);
        
        // Keep only the last 20 data points
        if (history.timestamps.length > 20) {
            history.timestamps.shift();
            history.cpu.shift();
            history.memory.shift();
        }
    }
    
    function updateCharts() {
        if (!currentContainerId || !historyData[currentContainerId]) return;
        
        const history = historyData[currentContainerId];
        
        cpuChart.data.labels = history.timestamps;
        cpuChart.data.datasets[0].data = history.cpu;
        cpuChart.update();
        
        memoryChart.data.labels = history.timestamps;
        memoryChart.data.datasets[0].data = history.memory;
        memoryChart.update();
    }
    
    function updateRefreshTime() {
        refreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }
    
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    function getUsageColor(percent) {
        if (percent < 50) return '#2ecc71';  // Green
        if (percent < 80) return '#f39c12';  // Orange
        return '#e74c3c';  // Red
    }
    
    // Make fetchStats available globally
    window.fetchStats = fetchStats;
});
