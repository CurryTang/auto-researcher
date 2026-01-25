# Excalidraw 图表模板

## 颜色方案

| 用途 | 颜色代码 | 说明 |
|-----|---------|------|
| 输入/输出 | `#b2f2bb` | 浅绿色 |
| 处理步骤 | `#a5d8ff` | 浅蓝色 |
| 关键模块 | `#ffc9c9` | 浅红色 |
| 数据存储 | `#ffec99` | 浅黄色 |
| 背景框 | `#e9ecef` | 浅灰色 |
| 子模块 | `#d0bfff` | 浅紫色 |

## 基础元素结构

```json
{
  "type": "rectangle",
  "x": 100, "y": 100,
  "width": 150, "height": 60,
  "backgroundColor": "#a5d8ff",
  "strokeColor": "#1e1e1e",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "roundness": { "type": 3 }
}
```

## 模板1：论文结构图

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {"type": "rectangle", "id": "problem", "x": 150, "y": 50, "width": 180, "height": 55, "backgroundColor": "#ffc9c9", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "id": "t1", "x": 190, "y": 65, "text": "问题定义", "fontSize": 18},
    
    {"type": "rectangle", "id": "method", "x": 150, "y": 145, "width": 180, "height": 75, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "id": "t2", "x": 165, "y": 155, "text": "方法\n• 模块A\n• 模块B", "fontSize": 14},
    
    {"type": "rectangle", "id": "exp", "x": 150, "y": 260, "width": 180, "height": 55, "backgroundColor": "#ffec99", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "id": "t3", "x": 190, "y": 275, "text": "实验验证", "fontSize": 18},
    
    {"type": "rectangle", "id": "conc", "x": 150, "y": 355, "width": 180, "height": 55, "backgroundColor": "#b2f2bb", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "id": "t4", "x": 190, "y": 370, "text": "主要结论", "fontSize": 18},
    
    {"type": "arrow", "x": 240, "y": 105, "points": [[0,0],[0,40]], "strokeWidth": 2},
    {"type": "arrow", "x": 240, "y": 220, "points": [[0,0],[0,40]], "strokeWidth": 2},
    {"type": "arrow", "x": 240, "y": 315, "points": [[0,0],[0,40]], "strokeWidth": 2}
  ],
  "appState": {"viewBackgroundColor": "#ffffff"}
}
```

## 模板2：方法流程图

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {"type": "rectangle", "id": "input", "x": 40, "y": 120, "width": 100, "height": 70, "backgroundColor": "#b2f2bb", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 55, "y": 135, "text": "输入\nX∈R^n", "fontSize": 14, "textAlign": "center"},
    
    {"type": "rectangle", "id": "step1", "x": 190, "y": 80, "width": 120, "height": 50, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 205, "y": 95, "text": "Step1: 编码", "fontSize": 14},
    
    {"type": "rectangle", "id": "step2", "x": 190, "y": 170, "width": 120, "height": 50, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 205, "y": 185, "text": "Step2: 处理", "fontSize": 14},
    
    {"type": "rectangle", "id": "output", "x": 360, "y": 120, "width": 100, "height": 70, "backgroundColor": "#b2f2bb", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 375, "y": 135, "text": "输出\nY∈R^m", "fontSize": 14, "textAlign": "center"},
    
    {"type": "arrow", "x": 140, "y": 135, "points": [[0,0],[50,-30]], "strokeWidth": 2},
    {"type": "arrow", "x": 140, "y": 175, "points": [[0,0],[50,20]], "strokeWidth": 2},
    {"type": "arrow", "x": 250, "y": 130, "points": [[0,0],[0,40]], "strokeWidth": 2},
    {"type": "arrow", "x": 310, "y": 105, "points": [[0,0],[50,40]], "strokeWidth": 2},
    {"type": "arrow", "x": 310, "y": 195, "points": [[0,0],[50,-30]], "strokeWidth": 2}
  ],
  "appState": {"viewBackgroundColor": "#ffffff"}
}
```

## 模板3：仓库结构图

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {"type": "rectangle", "id": "root", "x": 180, "y": 30, "width": 140, "height": 45, "backgroundColor": "#ffc9c9", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 210, "y": 42, "text": "project/", "fontSize": 16, "fontFamily": 3},
    
    {"type": "rectangle", "id": "src", "x": 50, "y": 120, "width": 100, "height": 40, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 75, "y": 130, "text": "src/", "fontSize": 14, "fontFamily": 3},
    
    {"type": "rectangle", "id": "data", "x": 180, "y": 120, "width": 100, "height": 40, "backgroundColor": "#ffec99", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 200, "y": 130, "text": "data/", "fontSize": 14, "fontFamily": 3},
    
    {"type": "rectangle", "id": "cfg", "x": 310, "y": 120, "width": 100, "height": 40, "backgroundColor": "#e9ecef", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 325, "y": 130, "text": "configs/", "fontSize": 14, "fontFamily": 3},
    
    {"type": "rectangle", "id": "model", "x": 20, "y": 200, "width": 85, "height": 35, "backgroundColor": "#d0bfff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 1, "roundness": {"type": 3}},
    {"type": "text", "x": 30, "y": 208, "text": "model.py", "fontSize": 11, "fontFamily": 3},
    
    {"type": "rectangle", "id": "train", "x": 115, "y": 200, "width": 85, "height": 35, "backgroundColor": "#d0bfff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 1, "roundness": {"type": 3}},
    {"type": "text", "x": 130, "y": 208, "text": "train.py", "fontSize": 11, "fontFamily": 3},
    
    {"type": "line", "x": 250, "y": 75, "points": [[0,0],[-150,45]], "strokeWidth": 1},
    {"type": "line", "x": 250, "y": 75, "points": [[0,0],[0,45]], "strokeWidth": 1},
    {"type": "line", "x": 250, "y": 75, "points": [[0,0],[110,45]], "strokeWidth": 1},
    {"type": "line", "x": 100, "y": 160, "points": [[0,0],[-38,40]], "strokeWidth": 1},
    {"type": "line", "x": 100, "y": 160, "points": [[0,0],[57,40]], "strokeWidth": 1}
  ],
  "appState": {"viewBackgroundColor": "#ffffff"}
}
```

## 模板4：代码架构图

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {"type": "rectangle", "id": "main", "x": 180, "y": 30, "width": 120, "height": 45, "backgroundColor": "#ffc9c9", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 205, "y": 42, "text": "main.py", "fontSize": 14, "fontFamily": 3},
    
    {"type": "rectangle", "id": "trainer", "x": 50, "y": 120, "width": 130, "height": 65, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 65, "y": 128, "text": "Trainer\n• train()\n• eval()", "fontSize": 12, "fontFamily": 3},
    
    {"type": "rectangle", "id": "model", "x": 300, "y": 120, "width": 130, "height": 65, "backgroundColor": "#a5d8ff", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 315, "y": 128, "text": "Model\n• forward()\n• loss()", "fontSize": 12, "fontFamily": 3},
    
    {"type": "rectangle", "id": "data", "x": 50, "y": 230, "width": 130, "height": 50, "backgroundColor": "#ffec99", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 65, "y": 242, "text": "Dataset\n• __getitem__()", "fontSize": 12, "fontFamily": 3},
    
    {"type": "rectangle", "id": "enc", "x": 300, "y": 230, "width": 130, "height": 50, "backgroundColor": "#b2f2bb", "strokeColor": "#1e1e1e", "fillStyle": "solid", "strokeWidth": 2, "roundness": {"type": 3}},
    {"type": "text", "x": 315, "y": 242, "text": "Encoder\n• encode()", "fontSize": 12, "fontFamily": 3},
    
    {"type": "arrow", "x": 180, "y": 52, "points": [[0,0],[-65,68]], "strokeWidth": 2},
    {"type": "arrow", "x": 300, "y": 52, "points": [[0,0],[65,68]], "strokeWidth": 2},
    {"type": "arrow", "x": 115, "y": 185, "points": [[0,0],[0,45]], "strokeWidth": 1, "strokeStyle": "dashed"},
    {"type": "arrow", "x": 365, "y": 185, "points": [[0,0],[0,45]], "strokeWidth": 1, "strokeStyle": "dashed"}
  ],
  "appState": {"viewBackgroundColor": "#ffffff"}
}
```

## 动态生成指南

Agent生成图表时：

1. **计算布局**：根据元素数量计算位置，避免重叠
2. **保持对齐**：同层元素y坐标相同
3. **统一间距**：元素间距保持一致（推荐60-80px）
4. **箭头连接**：`points` 使用相对坐标 `[[0,0], [dx, dy]]`
5. **中文文字**：`fontFamily: 1`（手写体）或 `3`（等宽）