document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const containersList = document.getElementById('containers-list');
    const statsContainer = document.getElementById('stats-container');
    const systemInfo = document.getElementById('system-info');
    const refreshTime = document.getElementById('refresh-time');
    const timeRangeSelect = document.getElementById('time-range');
    
    // Chart Contexts
    const cpuChartCtx = document.getElementById('cpu-chart').getContext('2d');
    const memoryChartCtx = document.getElementById('memory-chart').getContext('2d');
    const networkChartCtx = document.getElementById('network-chart').getContext('2d');

    // Chart Instances
    let cpuChart, memoryChart, networkChart;
    let currentContainerId = localStorage.getItem('selectedContainerId') || null;
    const historyData = {
        cpu: [],
        memory: [],
        network: {
            rx: [],
            tx: []
        }
    };
    let isFetching = false;
    let currentTimeRange = '1h';

    // Initialize all charts
    function initCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            }
        };

        // CPU Chart
        cpuChart = new Chart(cpuChartCtx, {
            type: 'line',
            data: {
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
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
                    y: {
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Percentage' }
                    }
                }
            }
        });

        // Memory Chart
        memoryChart = new Chart(memoryChartCtx, {
            type: 'line',
            data: {
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
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
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
                ...chartOptions,
                scales: {
                    ...chartOptions.scales,
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
                const validContainer = containers.find(c => c.id === currentContainerId) || containers[0];
                if (currentContainerId !== validContainer.id) {
                    currentContainerId = validContainer.id;
                    localStorage.setItem('selectedContainerId', currentContainerId);
                }
                await fetchStats(currentContainerId);
            } else {
                statsContainer.innerHTML = '<div class="text-gray-600">No running containers</div>';
                clearCharts();
            }
        } catch (error) {
            console.error('Fetch error:', error);
            statsContainer.innerHTML = '<div class="text-red-600">Failed to load data</div>';
        } finally {
            isFetching = false;
        }
    }

    async function fetchStats(containerId) {
        try {
            const [statsRes, networkRes, logsRes] = await Promise.all([
                fetch(`/api/stats/${containerId}?timeRange=${currentTimeRange}`),
                fetch(`/api/network/${containerId}?timeRange=${currentTimeRange}`),
                fetch(`/api/logs/${containerId}?timeRange=${currentTimeRange}`)
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
            statsContainer.innerHTML = '<div class="text-red-600">Failed to load stats</div>';
        }
    }

    function renderSystemInfo(system) {
        systemInfo.innerHTML = `
            <h3 class="text-lg font-semibold mb-4">Docker System Information</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">Containers:</span>
                    <span class="ml-2">${system.ContainersRunning || 0} running / ${system.Containers || 0} total</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">Images:</span>
                    <span class="ml-2">${system.Images || 0}</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">Docker Version:</span>
                    <span class="ml-2">${system.ServerVersion || 'N/A'}</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">OS:</span>
                    <span class="ml-2">${system.OperatingSystem || 'N/A'}</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">Hostname:</span>
                    <span class="ml-2">${system.Name || 'N/A'}</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-md">
                    <span class="text-gray-600">Memory:</span>
                    <span class="ml-2">${system.MemTotal ? formatBytes(system.MemTotal) : 'N/A'}</span>
                </div>
            </div>
        `;
    }

    function renderContainers(containers) {
        containersList.innerHTML = containers.map(container => `
            <div class="container-item ${container.id === currentContainerId ? 'bg-primary bg-opacity-10 border-primary' : 'bg-white border-gray-200'} 
                border rounded-md p-3 cursor-pointer transition-colors hover:bg-gray-50"
                onclick="selectContainer('${container.id}')">
                <div class="flex items-center mb-1">
                    <span class="status-indicator ${container.status} w-3 h-3 rounded-full mr-2"></span>
                    <span class="font-semibold">${container.name}</span>
                </div>
                <div class="text-sm text-gray-600">${container.image}</div>
                <div class="text-sm text-gray-500">${container.status}</div>
            </div>
        `).join('');
    }

    function renderStats(stats) {
        statsContainer.innerHTML = `
            <h3 class="text-lg font-semibold mb-4">Real-time Statistics</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-gray-600 mb-1">CPU Usage:</label>
                    <div class="h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full ${getUsageColorClass(stats.cpu_percent)} transition-all duration-300" 
                            style="width: ${stats.cpu_percent}%">
                            <span class="text-white text-sm px-2">${stats.cpu_percent}%</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-gray-600 mb-1">Memory Usage:</label>
                    <div class="h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full ${getUsageColorClass(stats.memory_percent)} transition-all duration-300" 
                            style="width: ${stats.memory_percent}%">
                            <span class="text-white text-sm px-2">
                                ${formatBytes(stats.memory_usage)} / ${formatBytes(stats.memory_limit)} (${stats.memory_percent}%)
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Processes:</span>
                    <span class="font-semibold">${stats.pids}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-600">Last Updated:</span>
                    <span class="font-semibold">${new Date(stats.time).toLocaleTimeString()}</span>
                </div>
            </div>
        `;
    }

    function updateNetworkDisplay(network) {
        document.getElementById('rx-bytes').textContent = network.rx_bytes ? formatBytes(network.rx_bytes) : 'N/A';
        document.getElementById('tx-bytes').textContent = network.tx_bytes ? formatBytes(network.tx_bytes) : 'N/A';
    }

    function updateLogsDisplay(logs) {
        const accessLogsElement = document.getElementById('access-logs');
        const errorLogsElement = document.getElementById('error-logs');
        const logSearchInput = document.getElementById('log-search');
        
        window.currentLogs = logs || { access: [], error: [] };
        
        const formatLogEntry = (log) => {
            const timestamp = log.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
            if (timestamp) {
                const time = new Date(timestamp[1]).toLocaleTimeString();
                const content = log.slice(timestamp[0].length).trim();
                return `<span class="text-gray-500">[${time}]</span> ${content}`;
            }
            return log;
        };

        accessLogsElement.innerHTML = logs.access.map(formatLogEntry).join('\n');
        errorLogsElement.innerHTML = logs.error.map(formatLogEntry).join('\n');
    }

    function updateHistory(containerId, stats, network) {
        const now = new Date();
        
        // Update CPU history
        historyData.cpu.push({
            x: now,
            y: stats.cpu_percent
        });
        
        // Update memory history
        historyData.memory.push({
            x: now,
            y: stats.memory_percent
        });
        
        // Update network history
        historyData.network.rx.push({
            x: now,
            y: network.rx_bytes || 0
        });
        historyData.network.tx.push({
            x: now,
            y: network.tx_bytes || 0
        });

        // Trim history based on time range
        const trimTime = new Date(now.getTime() - getTimeRangeMs(currentTimeRange));
        historyData.cpu = historyData.cpu.filter(point => point.x >= trimTime);
        historyData.memory = historyData.memory.filter(point => point.x >= trimTime);
        historyData.network.rx = historyData.network.rx.filter(point => point.x >= trimTime);
        historyData.network.tx = historyData.network.tx.filter(point => point.x >= trimTime);
    }

    function updateAllCharts() {
        cpuChart.data.datasets[0].data = historyData.cpu;
        memoryChart.data.datasets[0].data = historyData.memory;
        networkChart.data.datasets[0].data = historyData.network.rx;
        networkChart.data.datasets[1].data = historyData.network.tx;
        
        cpuChart.update();
        memoryChart.update();
        networkChart.update();
    }

    function clearCharts() {
        historyData.cpu = [];
        historyData.memory = [];
        historyData.network.rx = [];
        historyData.network.tx = [];
        
        updateAllCharts();
    }

    function updateRefreshTime() {
        refreshTime.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getUsageColorClass(percent) {
        if (percent < 50) return 'bg-green-500';
        if (percent < 80) return 'bg-yellow-500';
        return 'bg-red-500';
    }

    function getTimeRangeMs(range) {
        const ranges = {
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };
        return ranges[range] || ranges['1h'];
    }

    // Initialize
    initCharts();
    fetchData();
    setInterval(fetchData, 5000);
});

// Global functions
function selectContainer(containerId) {
    window.currentContainerId = containerId;
    localStorage.setItem('selectedContainerId', containerId);
    document.querySelectorAll('.container-item').forEach(item => {
        item.classList.remove('bg-primary', 'bg-opacity-10', 'border-primary');
        item.classList.add('bg-white', 'border-gray-200');
    });
    document.querySelector(`[onclick="selectContainer('${containerId}')"]`).classList.add('bg-primary', 'bg-opacity-10', 'border-primary');
    window.fetchStats(containerId);
}

function switchLogs(type) {
    document.querySelectorAll('.log-tab').forEach(tab => {
        tab.classList.remove('border-primary', 'text-primary');
        tab.classList.add('border-transparent');
    });
    document.querySelector(`[data-log-type="${type}"]`).classList.add('border-primary', 'text-primary');
    
    document.querySelectorAll('.log-output').forEach(output => {
        output.classList.add('hidden');
    });
    document.getElementById(`${type}-logs`).classList.remove('hidden');
}

function filterLogs() {
    const searchTerm = document.getElementById('log-search').value.toLowerCase();
    const activeLogType = document.querySelector('.log-tab.border-primary').dataset.logType;
    const logsElement = document.getElementById(`${activeLogType}-logs`);
    
    const logs = window.currentLogs[activeLogType];
    logsElement.innerHTML = logs
        .filter(log => log.toLowerCase().includes(searchTerm))
        .map(log => {
            const timestamp = log.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
            if (timestamp) {
                const time = new Date(timestamp[1]).toLocaleTimeString();
                const content = log.slice(timestamp[0].length).trim();
                return `<span class="text-gray-500">[${time}]</span> ${content}`;
            }
            return log;
        })
        .join('\n');
}

function clearLogSearch() {
    document.getElementById('log-search').value = '';
    filterLogs();
}

function applyTimeRange() {
    const timeRange = document.getElementById('time-range').value;
    window.currentTimeRange = timeRange;
    window.fetchStats(window.currentContainerId);
}
