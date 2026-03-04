// 电子物料规格描述工具 - 核心逻辑

// 默认物料分类配置
const defaultCategories = {
    resistor: {
        name: '电阻',
        icon: '🔲',
        fields: ['阻值', '精度', '功率', '封装', '温度系数'],
        patterns: {
            model: /([RC]\d{4}[A-Z]{0,2}[-_]?\d{0,4}[A-Z]{0,2}[-_]?\d{0,4})/i,
            resistance: /(\d+\.?\d*\s*[KkMmΩω]|\d+\.?\d*\s*[KkMm]?[Ωω])/,
            tolerance: /([±±]\d+%)/,
            power: /(\d\/\d+W|\d+W)/i,
            package: /(0201|0402|0603|0805|1206|1210|1812|2512)/
        }
    },
    capacitor: {
        name: '电容',
        icon: '⚡',
        fields: ['容值', '耐压', '材质', '封装', '精度'],
        patterns: {
            model: /([CL]\d{4}[A-Z]{0,2}[-_]?\d{0,4})/i,
            capacitance: /(\d+\.?\d*\s*[pnuμµm]?[Ff]|\d{3,4})/,
            voltage: /(\d+V)/,
            material: /(X7R|X5R|NPO|C0G|Y5V)/i,
            package: /(0201|0402|0603|0805|1206|1210|1812|2512)/
        }
    },
    inductor: {
        name: '电感',
        icon: '〰️',
        fields: ['感值', '精度', '电流', '封装', 'DCR'],
        patterns: {
            model: /([L]\d{4}[A-Z]{0,2}[-_]?\d{0,4})/i,
            inductance: /(\d+\.?\d*\s*[pnuμµm]?[Hh]|\d{3,4})/,
            current: /(\d+\.?\d*\s*[Aa])/,
            package: /(0201|0402|0603|0805|1206|1210)/
        }
    },
    ic: {
        name: 'IC芯片',
        icon: '🔷',
        fields: ['型号', '封装', '工作电压', '工作温度'],
        patterns: {
            model: /([A-Z]\d{2,10}[A-Z]{0,5}\d{0,4})/,
            package: /(SOP|SOT|QFN|BGA|DIP|LGA|QFP)\-?\d*/i
        }
    },
    connector: {
        name: '连接器',
        icon: '🔌',
        fields: ['型号', '引脚数', '间距', '封装'],
        patterns: {
            model: /([A-Z]{2,6}\d{2,10})/,
            pins: /(\d+)[Pp]/,
            pitch: /(\d+\.?\d*)mm/
        }
    },
    crystal: {
        name: '晶振',
        icon: '💎',
        fields: ['频率', '精度', '负载电容', '封装'],
        patterns: {
            model: /(\d{2,4}[Mm]?[Hh]?[Zz]?)/,
            frequency: /(\d+\.?\d*\s*[MmKk]?[Hh][Zz])/,
            tolerance: /([±±]\d+ppm)/i
        }
    }
};

// 当前状态
let currentCategory = null;
let currentConfig = {};
let extractionResults = [];

// 初始化
function init() {
    loadConfig();
    renderCategories();
    console.log('✅ 电子物料规格描述工具已初始化');
}

// 加载配置
function loadConfig() {
    const saved = localStorage.getItem('componentToolConfig');
    currentConfig = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(defaultCategories));
}

// 保存配置
function saveConfig() {
    localStorage.setItem('componentToolConfig', JSON.stringify(currentConfig));
    showToast('✅ 配置已保存');
}

// 渲染分类
function renderCategories() {
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = '';
    
    Object.entries(currentConfig).forEach(([key, category]) => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.onclick = () => selectCategory(key);
        card.innerHTML = `
            <div class="icon">${category.icon}</div>
            <div class="name">${category.name}</div>
        `;
        grid.appendChild(card);
    });
}

// 选择分类
function selectCategory(key) {
    currentCategory = key;
    
    // 更新UI
    document.querySelectorAll('.category-card').forEach(card => {
        card.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // 显示配置面板
    document.getElementById('configSection').style.display = 'block';
    renderConfigPanel(key);
    
    // 滚动到配置区域
    document.getElementById('configSection').scrollIntoView({ behavior: 'smooth' });
}

// 渲染配置面板
function renderConfigPanel(key) {
    const category = currentConfig[key];
    const panel = document.getElementById('configPanel');
    
    panel.innerHTML = `
        <h3>${category.icon} ${category.name}</h3>
        <p>需要提取的规格字段：</p>
        <div class="spec-fields">
            ${category.fields.map(field => `<span class="spec-field">${field}</span>`).join('')}
        </div>
        <p style="margin-top:15px;opacity:0.7;font-size:12px;">
            提示：系统将自动识别以上字段，您也可以在上方的输入框中直接粘贴数据手册内容。
        </p>
    `;
}

// 提取规格
function extractSpecs() {
    const input = document.getElementById('inputText').value.trim();
    if (!input) {
        showToast('❌ 请输入数据手册内容');
        return;
    }
    
    if (!currentCategory) {
        showToast('❌ 请先选择物料分类');
        return;
    }
    
    // 解析输入（按行分割）
    const lines = input.split('\n').filter(line => line.trim());
    extractionResults = [];
    
    const config = currentConfig[currentCategory];
    
    lines.forEach(line => {
        const result = parseLine(line, config);
        if (result.model) {
            extractionResults.push(result);
        }
    });
    
    // 显示结果
    renderResults();
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
    
    showToast(`✅ 成功提取 ${extractionResults.length} 条记录`);
}

// 解析单行
function parseLine(line, config) {
    const result = {
        model: '',
        description: '',
        category: config.name,
        specs: {}
    };
    
    // 提取型号
    const modelMatch = line.match(config.patterns.model);
    if (modelMatch) {
        result.model = modelMatch[1];
    }
    
    // 根据分类提取规格
    if (currentCategory === 'resistor') {
        const resistance = line.match(config.patterns.resistance);
        const tolerance = line.match(config.patterns.tolerance);
        const power = line.match(config.patterns.power);
        const package = line.match(config.patterns.package);
        
        if (resistance) result.specs.resistance = resistance[1];
        if (tolerance) result.specs.tolerance = tolerance[1];
        if (power) result.specs.power = power[1];
        if (package) result.specs.package = package[1];
        
        result.description = [
            result.specs.resistance,
            result.specs.tolerance,
            result.specs.power,
            result.specs.package ? result.specs.package + '封装' : ''
        ].filter(Boolean).join(' ');
    }
    else if (currentCategory === 'capacitor') {
        const capacitance = line.match(config.patterns.capacitance);
        const voltage = line.match(config.patterns.voltage);
        const material = line.match(config.patterns.material);
        const package = line.match(config.patterns.package);
        
        if (capacitance) result.specs.capacitance = capacitance[1];
        if (voltage) result.specs.voltage = voltage[1];
        if (material) result.specs.material = material[1];
        if (package) result.specs.package = package[1];
        
        result.description = [
            result.specs.capacitance,
            result.specs.voltage,
            result.specs.material,
            result.specs.package ? result.specs.package + '封装' : ''
        ].filter(Boolean).join(' ');
    }
    else if (currentCategory === 'ic') {
        const package = line.match(config.patterns.package);
        if (package) result.specs.package = package[1];
        
        result.description = result.specs.package ? result.specs.package + '封装' : 'IC芯片';
    }
    else {
        // 通用处理
        result.description = line.substring(0, 50) + (line.length > 50 ? '...' : '');
    }
    
    return result;
}

// 渲染结果
function renderResults() {
    const tbody = document.getElementById('resultBody');
    tbody.innerHTML = '';
    
    extractionResults.forEach((result, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><code>${result.model}</code></td>
            <td>${result.description}</td>
            <td>${result.category}</td>
            <td>
                <button class="btn btn-secondary" onclick="copyResult(${index})">
                    📋 复制
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 复制单条结果
function copyResult(index) {
    const result = extractionResults[index];
    const text = `${result.model}\t${result.description}`;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('✅ 已复制到剪贴板');
    });
}

// 复制全部
function copyAll() {
    if (extractionResults.length === 0) return;
    
    const text = extractionResults.map(r => `${r.model}\t${r.description}`).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(`✅ 已复制 ${extractionResults.length} 条记录`);
    });
}

// 导出CSV
function exportCSV() {
    if (extractionResults.length === 0) return;
    
    let csv = '型号,规格描述,分类\n';
    extractionResults.forEach(r => {
        csv += `"${r.model}","${r.description}","${r.category}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `物料规格_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    showToast('✅ CSV文件已下载');
}

// 清空输入
function clearInput() {
    document.getElementById('inputText').value = '';
    document.getElementById('resultSection').style.display = 'none';
    extractionResults = [];
}

// 显示提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 2000);
}

// 弹窗控制
function closeModal() {
    document.getElementById('configModal').classList.remove('active');
}

// 启动
init();
