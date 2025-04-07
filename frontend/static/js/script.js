document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const containersList = document.getElementById('containers-list');
    const statsContainer = document.getElementById('stats-container');
    const systemInfo = document.getElementById('system-info');
    const refreshTime = document.getElementById('refresh-time');
    
    // Chart Contexts
    const cpuChartCtx = document.getElementById('cpu-chart').getContext('2d');
    const memoryChartCtx = document.getElementById('memory-chart').getContext('2d');
    const networkChartCtx = document.getElementById('network-chart').getContext('2d');

    // Chart Instances
    let cpuChart, memoryChart, networkChart;
    let currentContainerId = localStorage.getItem('selectedContainerId') || null;
    const historyData = {};
    let isFetching = false;

    // Initialize all charts
    function initCharts() {
        // CPU Chart (0-100%)
        cpuChart = new Chart(cpuChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Usage %',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.2)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Percentage' }
                    }
                }
            }
        });

        // Memory Chart (0-100%)
        memoryChart = new Chart(memoryChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Memory Usage %',
                    data: [],
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.2)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Percentage' }
                    }
                }
            }
        });

        // Network Chart
        networkChart = new Chart(networkChartCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RX Bytes',
                        data: [],
                        borderColor: '#2ecc71',
                        backgroundColor: 'rgba(46, 204, 113, 0.1)',
                        fill: true
                    },
                    {
                        label: 'TX Bytes',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Bytes' }
                    }
                }
            }
        });
    }

    async function fetchData() {
        if (isFetching) return;
        isFetching = true;
        
        try {
            updateRefreshTime();
            
            // Fetch containers and system info
            const [containersRes, systemRes] = await Promise.all([
                fetch('/api/containers'),
                fetch('/api/system')
            ]);

            const containers = await containersRes.json();
            const system = await systemRes.json();

            renderSystemInfo(system);
            renderContainers(containers);

            if (containers.length) {
                // Check if stored container still exists
                const validContainer = containers.find(c => c.id === currentContainerId) || containers[0];
                if (currentContainerId !== validContainer.id) {
                    currentContainerId = validContainer.id;
                    localStorage.setItem('selectedContainerId', currentContainerId);
                }
                await fetchStats(currentContainerId);
            } else {
                statsContainer.innerHTML = '<div class="info-msg">No running containers</div>';
                clearCharts();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            statsContainer.innerHTML = '<div class="error-msg">Failed to load data</div>';
        } finally {
            isFetching = false;
        }
    }

    async function fetchStats(containerId) {
        try {
            const [statsRes, networkRes, logsRes] = await Promise.all([
                fetch(`/api/stats/${containerId}`),
                fetch(`/api/network/${containerId}`),
                fetch(`/api/logs/${containerId}`)
            ]);

            const stats = await statsRes.json();
            const network = await networkRes.json();
            const logs = await logsRes.json();

            renderStats(stats);
            updateNetworkDisplay(network);
            updateLogsDisplay(logs);
            updateHistory(containerId, stats, network);
            updateAllCharts();
        } catch (error) {
            console.error('Stats error:', error);
            statsContainer.innerHTML = '<div class="error-msg">Failed to load stats</div>';
        }
    }

    function renderSystemInfo(system) {
        systemInfo.innerHTML = `
            <h3>Docker System Information</h3>
            <div class="system-grid">
                <div class="system-item">
                    <label>Containers:</label>
                    <span>${system.ContainersRunning || 0} running / ${system.Containers || 0} total</span>
                </div>
                <div class="system-item">
                    <label>Images:</label>
                    <span>${system.Images || 0}</span>
                </div>
                <div class="system-item">
                    <label>Docker Version:</label>
                    <span>${system.ServerVersion || 'N/A'}</span>
                </div>
                <div class="system-item">
                    <label>OS:</label>
                    <span>${system.OperatingSystem || 'N/A'}</span>
                </div>
                <div class="system-item">
                    <label>Hostname:</label>
                    <span>${system.Name || 'N/A'}</span>
                </div>
                <div class="system-item">
                    <label>Memory:</label>
                    <span>${system.MemTotal ? formatBytes(system.MemTotal) : 'N/A'}</span>
                </div>
            </div>
        `;
    }

    function renderContainers(containers) {
        containersList.innerHTML = containers.map(container => `
            <div class="container-item ${container.id === currentContainerId ? 'active' : ''}"
                onclick="selectContainer('${container.id}')">
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
                    <div class="progress" style="width: ${stats.cpu_percent}%; background: ${getUsageColor(stats.cpu_percent)}"></div>
                    <span>${stats.cpu_percent}%</span>
                </div>
            </div>
            <div class="stat-item">
                <label>Memory Usage:</label>
                <div class="progress-bar">
                    <div class="progress" style="width: ${stats.memory_percent}%; background: ${getUsageColor(stats.memory_percent)}"></div>
                    <span>${formatBytes(stats.memory_usage)} / ${formatBytes(stats.memory_limit)} (${stats.memory_percent}%)</span>
                </div>
            </div>
            <div class="stat-item"><label>Processes:</label><span>${stats.pids}</span></div>
            <div class="stat-item"><label>Last Updated:</label><span>${new Date(stats.time).toLocaleTimeString()}</span></div>
        `;
    }

    function updateNetworkDisplay(network) {
        document.getElementById('rx-bytes').textContent = network.rx_bytes ? formatBytes(network.rx_bytes) : 'N/A';
        document.getElementById('tx-bytes').textContent = network.tx_bytes ? formatBytes(network.tx_bytes) : 'N/A';
    }

    function updateLogsDisplay(logs) {
        const formatLog = (log) => {
            if (!log) return '';
            // Handle both string logs and object logs
            if (typeof log === 'object') {
                return JSON.stringify(log, null, 2);
            }
            return log;
        };

        const accessLogsElement = document.getElementById('access-logs');
        const errorLogsElement = document.getElementById('error-logs');

        accessLogsElement.innerHTML = logs.access?.length 
            ? logs.access.map(log => `<div class="log-line">${formatLog(log)}</div>`).join('')
            : '<div class="info-msg">No access logs available</div>';

        errorLogsElement.innerHTML = logs.error?.length
            ? logs.error.map(log => `<div class="log-line error">${formatLog(log)}</div>`).join('')
            : '<div class="info-msg">No error logs available</div>';
    }

    function updateHistory(containerId, stats, network) {
        if (!historyData[containerId]) {
            historyData[containerId] = {
                timestamps: [],
                cpu: [],
                memory: [],
                rx: [],
                tx: []
            };
        }

        const history = historyData[containerId];
        const now = new Date(stats.time);

        // Keep maximum 20 data points
        if (history.timestamps.length >= 20) {
            history.timestamps.shift();
            history.cpu.shift();
            history.memory.shift();
            history.rx.shift();
            history.tx.shift();
        }

        // Add new data
        history.timestamps.push(now.toLocaleTimeString());
        history.cpu.push(stats.cpu_percent);
        history.memory.push(stats.memory_percent);
        history.rx.push(network.rx_bytes || 0);
        history.tx.push(network.tx_bytes || 0);
    }

    function updateAllCharts() {
        const history = historyData[currentContainerId];
        if (!history) return;
        
        cpuChart.data.labels = history.timestamps;
        cpuChart.data.datasets[0].data = history.cpu;
        cpuChart.update();

        memoryChart.data.labels = history.timestamps;
        memoryChart.data.datasets[0].data = history.memory;
        memoryChart.update();

        networkChart.data.labels = history.timestamps;
        networkChart.data.datasets[0].data = history.rx;
        networkChart.data.datasets[1].data = history.tx;
        networkChart.update();
    }

    function clearCharts() {
        cpuChart.data.labels = [];
        cpuChart.data.datasets[0].data = [];
        cpuChart.update();

        memoryChart.data.labels = [];
        memoryChart.data.datasets[0].data = [];
        memoryChart.update();

        networkChart.data.labels = [];
        networkChart.data.datasets[0].data = [];
        networkChart.data.datasets[1].data = [];
        networkChart.update();
    }

    function updateRefreshTime() {
        refreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 Bytes';
        const units = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }

    function getUsageColor(percent) {
        if (percent < 50) return '#2ecc71';
        if (percent < 80) return '#f39c12';
        return '#e74c3c';
    }

    // Container selection handler
    window.selectContainer = function(containerId) {
        currentContainerId = containerId;
        localStorage.setItem('selectedContainerId', containerId);
        fetchStats(containerId);
        
        // Update active state in UI
        document.querySelectorAll('.container-item').forEach(item => {
            item.classList.toggle('active', item.getAttribute('onclick').includes(containerId));
        });
    };

    // Initialize and start updating
    initCharts();
    fetchData();
    setInterval(fetchData, 5000); // Update every 5 seconds
});
