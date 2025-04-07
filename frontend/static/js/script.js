document.addEventListener('DOMContentLoaded', function () {
    const containersList = document.getElementById('containers-list');
    const statsContainer = document.getElementById('stats-container');
    const systemInfo = document.getElementById('system-info');
    const refreshTime = document.getElementById('refresh-time');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Chart contexts
    const cpuChartCtx = document.getElementById('cpu-chart')?.getContext('2d');
    const memoryChartCtx = document.getElementById('memory-chart')?.getContext('2d');
    const networkChartCtx = document.getElementById('network-chart')?.getContext('2d');

    // Chart instances
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
            options: chartOptions('Percentage')
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
            options: chartOptions('Percentage')
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
            options: chartOptions('Bytes')
        });
    }

    function chartOptions(yAxisLabel) {
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
                }
            }
        };
    }

    async function fetchData() {
        showLoading();
        try {
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
                const validContainer = containers.find(c => c.id === currentContainerId) || containers[0];
                currentContainerId = validContainer.id;
                await fetchStats(currentContainerId);
            } else {
                clearCharts();
                statsContainer.innerHTML = `<p class="info-msg">No running containers</p>`;
            }
        } catch (error) {
            showError('Failed to load data', error);
        } finally {
            hideLoading();
        }
    }

    async function fetchStats(containerId) {
        showLoading();
        try {
            const [statsRes, networkRes, logsRes] = await Promise.all([
                fetch(`/api/stats/${containerId}`),
                fetch(`/api/network/${containerId}`),
                fetch(`/api/logs/${containerId}`)
            ]);

            const stats = await statsRes.json();
            const network = await networkRes.json();
            const logs = await logsRes.json();

            if (stats.error || network.error || logs.error) {
                throw new Error(stats.error || network.error || logs.error);
            }

            renderStats(stats);
            updateNetworkDisplay(network);
            updateLogsDisplay(logs);
            updateHistory(containerId, stats, network);
            updateAllCharts();
        } catch (error) {
            showError('Failed to load stats', error);
        } finally {
            hideLoading();
        }
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
        history.rx.push(network.rx_bytes);
        history.tx.push(network.tx_bytes);
    }

    function updateAllCharts() {
        const history = historyData[currentContainerId];
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

    function updateNetworkDisplay(network) {
        document.getElementById('rx-bytes').textContent = formatBytes(network.rx_bytes);
        document.getElementById('tx-bytes').textContent = formatBytes(network.tx_bytes);
    }

    function updateLogsDisplay(logs) {
        const formatLogEntry = (log) => {
            const timestampMatch = log.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)/);
            if (timestampMatch) {
                return `<div class="log-line">
                    <span class="log-time">${timestampMatch[1]}</span>
                    ${log.replace(timestampMatch[0], '')}
                </div>`;
            }
            return `<div class="log-line">${log}</div>`;
        };

        document.getElementById('access-logs').innerHTML = 
            logs.access?.map(formatLogEntry).join('') || 'No access logs';
            
        document.getElementById('error-logs').innerHTML = 
            logs.error?.map(log => `<div class="log-line error">${formatLogEntry(log)}</div>`).join('') || 'No error logs';
    }

    // Helper functions
    function formatBytes(bytes) {
        if (typeof bytes !== 'number') return '0 Bytes';
        const units = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
    }

    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    function showError(message, error) {
        console.error(message, error);
        statsContainer.innerHTML = `
            <div class="error-msg">
                <h4>${message}</h4>
                <p>${error?.message || 'Unknown error'}</p>
            </div>
        `;
    }

    // Initialization
    initCharts();
    fetchData();
    setInterval(fetchData, 2000);

    // Make functions available globally for HTML event handlers
    window.fetchStats = fetchStats;
    window.switchLogs = function(type) {
        document.querySelectorAll('.log-output').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.log-tab').forEach(el => el.classList.remove('active'));
        document.getElementById(`${type}-logs`).classList.add('active');
        document.querySelector(`[data-log-type="${type}"]`).classList.add('active');
    };

    window.filterLogs = function() {
        const searchTerm = document.getElementById('log-search').value.toLowerCase();
        const activeLogs = document.querySelector('.log-output.active');
        
        Array.from(activeLogs.children).forEach(line => {
            const text = line.textContent.toLowerCase();
            line.style.display = text.includes(searchTerm) ? 'block' : 'none';
        });
    };

    window.clearLogs = function() {
        document.getElementById('access-logs').innerHTML = '';
        document.getElementById('error-logs').innerHTML = '';
    };
});
