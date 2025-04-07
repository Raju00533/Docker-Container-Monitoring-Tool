document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const containersList = document.getElementById('containers-list');
    const statsContainer = document.getElementById('stats-container');
    const systemInfo = document.getElementById('system-info');
    const refreshTime = document.getElementById('refresh-time');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Chart Contexts
    const cpuChartCtx = document.getElementById('cpu-chart')?.getContext('2d');
    const memoryChartCtx = document.getElementById('memory-chart')?.getContext('2d');
    const networkChartCtx = document.getElementById('network-chart')?.getContext('2d');

    // Chart Instances
    let cpuChart, memoryChart, networkChart;
    let currentContainerId = null;
    const historyData = {};

    // Initialize all charts
    function initCharts() {
        // CPU Chart
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
                    tension: 0.2
                }]
            },
            options: getChartOptions('Percentage')
        });

        // Memory Chart
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
                    tension: 0.2
                }]
            },
            options: getChartOptions('Percentage')
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
            options: getChartOptions('Bytes')
        });
    }

    function getChartOptions(yAxisLabel) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yAxisLabel
                    }
                },
                x: {
                    ticks: {
                        maxTicksLimit: 10,
                        autoSkip: true
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        };
    }

    async function fetchData() {
        showLoading();
        updateRefreshTime();
        
        try {
            const [containersRes, systemRes] = await Promise.all([
                fetch('/api/containers').catch(handleFetchError),
                fetch('/api/system').catch(handleFetchError)
            ]);

            const containers = await parseResponse(containersRes, 'containers');
            const system = await parseResponse(systemRes, 'system info');

            renderSystemInfo(system);
            renderContainers(containers);

            if (containers.length) {
                const validContainer = containers.find(c => c.id === currentContainerId) || containers[0];
                currentContainerId = validContainer.id;
                await fetchStats(currentContainerId);
            } else {
                clearCharts();
                statsContainer.innerHTML = '<div class="info-msg">No running containers found</div>';
            }
        } catch (error) {
            showError('Failed to load dashboard data', error);
        } finally {
            hideLoading();
        }
    }

    async function fetchStats(containerId) {
        showLoading();
        
        try {
            const [statsRes, networkRes, logsRes] = await Promise.all([
                fetch(`/api/stats/${containerId}`).catch(handleFetchError),
                fetch(`/api/network/${containerId}`).catch(handleFetchError),
                fetch(`/api/logs/${containerId}`).catch(handleFetchError)
            ]);

            const stats = await parseResponse(statsRes, 'stats');
            const network = await parseResponse(networkRes, 'network');
            const logs = await parseResponse(logsRes, 'logs');

            renderStats(stats);
            updateNetworkDisplay(network);
            updateLogsDisplay(logs);
            updateHistory(containerId, stats, network);
            updateAllCharts();
        } catch (error) {
            showError('Failed to load container stats', error);
        } finally {
            hideLoading();
        }
    }

    function renderSystemInfo(system) {
        if (!system || Object.keys(system).length === 0) {
            systemInfo.innerHTML = '<div class="error-msg">System information not available</div>';
            return;
        }

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
        if (!containers || containers.length === 0) {
            containersList.innerHTML = '<div class="info-msg">No containers found</div>';
            return;
        }

        containersList.innerHTML = containers.map(container => `
            <div class="container-item ${container.id === currentContainerId ? 'active' : ''}"
                role="button" tabindex="0"
                onclick="fetchStats('${container.id}')"
                onkeypress="if(event.key==='Enter') fetchStats('${container.id}')">
                <div class="container-header">
                    <span class="status-indicator ${container.status}"></span>
                    <span class="container-name">${container.name || 'Unnamed'}</span>
                </div>
                <span class="container-image">${container.image || 'No image'}</span>
                <span class="container-status">${container.status || 'Unknown'}</span>
            </div>
        `).join('');
    }

    function renderStats(stats) {
        if (!stats || Object.keys(stats).length === 0) {
            statsContainer.innerHTML = '<div class="error-msg">Statistics not available</div>';
            return;
        }

        statsContainer.innerHTML = `
            <h3>Real-time Statistics</h3>
            <div class="stat-item">
                <label>CPU Usage:</label>
                <div class="progress-bar">
                    <div class="progress" style="width: ${stats.cpu_percent || 0}%; background: ${getUsageColor(stats.cpu_percent || 0)}"></div>
                    <span>${stats.cpu_percent || 0}%</span>
                </div>
            </div>
            <div class="stat-item">
                <label>Memory Usage:</label>
                <div class="progress-bar">
                    <div class="progress" style="width: ${stats.memory_percent || 0}%; background: ${getUsageColor(stats.memory_percent || 0)}"></div>
                    <span>${formatBytes(stats.memory_usage || 0)} / ${formatBytes(stats.memory_limit || 0)} (${stats.memory_percent || 0}%)</span>
                </div>
            </div>
            <div class="stat-item"><label>Processes:</label><span>${stats.pids || 0}</span></div>
            <div class="stat-item"><label>Last Updated:</label><span>${stats.time ? new Date(stats.time).toLocaleTimeString() : 'N/A'}</span></div>
        `;
    }

    function updateNetworkDisplay(network) {
        if (!network) {
            document.getElementById('rx-bytes').textContent = 'N/A';
            document.getElementById('tx-bytes').textContent = 'N/A';
            return;
        }

        document.getElementById('rx-bytes').textContent = network.rx_bytes ? formatBytes(network.rx_bytes) : 'N/A';
        document.getElementById('tx-bytes').textContent = network.tx_bytes ? formatBytes(network.tx_bytes) : 'N/A';
    }

    function updateLogsDisplay(logs) {
        const formatLogEntry = (log) => {
            if (!log) return '';
            const timestampMatch = log.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)/);
            if (timestampMatch) {
                return `<div class="log-line">
                    <span class="log-time">${timestampMatch[1]}</span>
                    ${log.replace(timestampMatch[0], '')}
                </div>`;
            }
            return `<div class="log-line">${log}</div>`;
        };

        const accessLogs = document.getElementById('access-logs');
        const errorLogs = document.getElementById('error-logs');

        accessLogs.innerHTML = logs?.access?.length 
            ? logs.access.map(formatLogEntry).join('')
            : '<div class="info-msg">No access logs available</div>';

        errorLogs.innerHTML = logs?.error?.length 
            ? logs.error.map(log => `<div class="log-line error">${formatLogEntry(log)}</div>`).join('')
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
        const now = new Date(stats?.time || Date.now());

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
        history.cpu.push(stats?.cpu_percent || 0);
        history.memory.push(stats?.memory_percent || 0);
        history.rx.push(network?.rx_bytes || 0);
        history.tx.push(network?.tx_bytes || 0);
    }

    function updateAllCharts() {
        const history = currentContainerId ? historyData[currentContainerId] : null;
        if (!history) return;

        // CPU Chart
        cpuChart.data.labels = history.timestamps;
        cpuChart.data.datasets[0].data = history.cpu;
        cpuChart.update();

        // Memory Chart
        memoryChart.data.labels = history.timestamps;
        memoryChart.data.datasets[0].data = history.memory;
        memoryChart.update();

        // Network Chart
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

    // Helper Functions
    function formatBytes(bytes) {
        if (typeof bytes !== 'number' || bytes === 0) return '0 Bytes';
        const units = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }

    function getUsageColor(percent) {
        if (percent < 50) return '#2ecc71';
        if (percent < 80) return '#f39c12';
        return '#e74c3c';
    }

    function showLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    function updateRefreshTime() {
        if (refreshTime) refreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }

    function showError(message, error) {
        console.error(message, error);
        const errorMsg = error?.message || 'Unknown error occurred';
        statsContainer.innerHTML = `
            <div class="error-msg">
                <h4>${message}</h4>
                <p>${errorMsg}</p>
            </div>
        `;
    }

    async function parseResponse(response, dataType) {
        if (!response || !response.ok) {
            throw new Error(`Failed to fetch ${dataType}`);
        }
        return await response.json();
    }

    function handleFetchError(error) {
        console.error('Fetch error:', error);
        return { ok: false };
    }

    // Global Functions
    window.fetchStats = fetchStats;
    window.switchLogs = function(type) {
        document.querySelectorAll('.log-output').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.log-tab').forEach(el => el.classList.remove('active'));
        document.getElementById(`${type}-logs`).classList.add('active');
        document.querySelector(`[data-log-type="${type}"]`).classList.add('active');
    };

    window.filterLogs = function() {
        const searchTerm = document.getElementById('log-search')?.value?.toLowerCase() || '';
        const activeLogs = document.querySelector('.log-output.active');
        if (!activeLogs) return;

        Array.from(activeLogs.children).forEach(line => {
            const text = line.textContent.toLowerCase();
            line.style.display = text.includes(searchTerm) ? 'block' : 'none';
        });
    };

    window.clearLogs = function() {
        document.getElementById('access-logs').innerHTML = '<div class="info-msg">Logs cleared</div>';
        document.getElementById('error-logs').innerHTML = '<div class="info-msg">Logs cleared</div>';
    };

    // Initialization
    initCharts();
    fetchData();
    setInterval(fetchData, 2000); // Refresh every 2 seconds
});
