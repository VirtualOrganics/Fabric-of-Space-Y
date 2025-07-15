# Physics-Based Growth System Parameters

## Overview

The **Fabric of Space Y** physics-based growth system combines geometric analysis with realistic force interactions. Each cell's acuteness (acute angle count) determines its growth signal, and cells physically push/pull their neighbors to accommodate growth demands.

## Parameter Reference

### 🔬 **Core Growth Parameters**

#### **Threshold** (0-60, default: 5)
- **Purpose**: The acuteness "decision point" that determines which cells grow vs shrink
- **Effect**: 
  - Cells with acuteness **above** threshold → grow (push neighbors away)
  - Cells with acuteness **below** threshold → shrink (pull neighbors closer)
- **Tuning**: 
  - **Low values (0-10)**: Most cells are "high acuteness" → more growth
  - **High values (30-60)**: Only very spiky cells are "high acuteness" → less growth
- **Tip**: Watch the cell acuteness colors to see the distribution

#### **Rate** (0.0001-0.01, default: 0.001)
- **Purpose**: Base growth rate multiplier - how strongly cells want to grow/shrink
- **Effect**: Higher values = more aggressive growth signals
- **Tuning**: Start low (0.001) and increase until you see visible effects
- **Warning**: Too high can cause instability

#### **Power** (0.5-3.0, default: 1.5)
- **Purpose**: Non-linear scaling of growth signals
- **Effect**: 
  - **< 1.0**: Dampens differences (more uniform growth)
  - **= 1.0**: Linear relationship
  - **> 1.0**: Amplifies differences (more dramatic variation)
- **Example**: With threshold=10, acuteness=15:
  - Power=1.0: signal = 5
  - Power=2.0: signal = 25
  - Power=3.0: signal = 125

### ⚡ **Physics Parameters**

#### **Force Str** (0.1-5.0, default: 2.0)
- **Purpose**: How strongly growing cells push their neighbors
- **Effect**: This is your **"Goldilocks zone"** parameter
- **Tuning**:
  - **Too low (< 1.0)**: Cells barely move, no visible expansion
  - **Just right (1.0-3.0)**: Smooth, realistic expansion
  - **Too high (> 4.0)**: Explosive, unstable behavior
- **Physics**: Uses inverse square law - closer neighbors feel stronger forces

#### **Damping** (0.0-1.0, default: 0.8)
- **Purpose**: Reduces oscillations for stability
- **Effect**: 
  - **Low (0.0-0.5)**: Fast, jittery movement
  - **High (0.7-1.0)**: Smooth, controlled movement
- **Physics**: Velocity damping - each frame velocity *= damping

#### **Precision** (0.0001-0.01, default: 0.001)
- **Purpose**: Equilibrium detection threshold
- **Effect**: 
  - **Lower values**: More precise equilibrium, slower convergence
  - **Higher values**: Less precise equilibrium, faster convergence
- **Technical**: When max displacement < precision, equilibrium is reached

#### **Max Steps** (10-500, default: 100)
- **Purpose**: Maximum physics iterations before giving up on equilibrium
- **Effect**: 
  - **Low values (10-50)**: Fast but may not reach equilibrium
  - **High values (200-500)**: Slow but more likely to reach equilibrium
- **Use case**: Prevents infinite loops when equilibrium is impossible

### 🎮 **Control Parameters**

#### **Step Mode**
- **Manual**: Click "Step" button for each physics iteration
  - Use for: Debugging, understanding the process, precise control
  - Behavior: Each click runs physics until equilibrium OR max steps reached
- **Auto**: Continuous physics steps (like original system)
  - Use for: Normal operation, smooth animation
  - Behavior: Physics runs every frame
- **Equilibrium**: Run until equilibrium reached, then stop
  - Use for: Finding stable configurations
  - Behavior: Physics runs until convergence, then pauses

#### **Normalize** (checkbox, default: checked)
- **Purpose**: Scale all growth signals to same magnitude
- **Effect**: 
  - **Checked**: Strongest grower gets signal=1.0, others scaled proportionally
  - **Unchecked**: Raw signals based on acuteness differences
- **Use case**: Prevents one super-acute cell from dominating

### 📊 **Statistics Display**

#### **Growth Stats**
- **Grow**: Number of cells currently expanding
- **Shrink**: Number of cells currently contracting
- **Avg Δ**: Average displacement per active cell
- **Max Δ**: Maximum displacement of any cell

#### **Physics Stats**
- **Physics**: Number of physics iterations in last step
- **Equilibrium**: Whether equilibrium was reached (Yes/No)

## 🎯 **Tuning Guide**

### **For Realistic Growth**
1. **Threshold**: 5-15 (based on your cell acuteness distribution)
2. **Rate**: 0.001-0.005 (start low, increase gradually)
3. **Power**: 1.5-2.0 (moderate non-linearity)
4. **Force Str**: 1.5-2.5 (the critical parameter)
5. **Damping**: 0.7-0.9 (smooth motion)
6. **Precision**: 0.001-0.005 (balance speed vs accuracy)

### **For Debugging**
1. **Step Mode**: Manual
2. **Max Steps**: 20-50 (see each step clearly)
3. **Force Str**: 1.0-2.0 (controlled forces)
4. **Precision**: 0.01 (loose equilibrium for faster steps)

### **For Fast Animation**
1. **Step Mode**: Auto
2. **Max Steps**: 10-30 (quick physics)
3. **Precision**: 0.005-0.01 (loose equilibrium)
4. **Damping**: 0.8-0.9 (stability)

## 🔧 **Technical Details**

### **Force Calculation**
```javascript
// For each growing cell with neighbors
const distance = euclideanDistance(growingCell, neighbor);
const forceMagnitude = (growthRate * forceStrength) / (distance * distance);
const forceVector = normalize(neighbor - growingCell) * forceMagnitude;
```

### **Equilibrium Detection**
```javascript
// After each physics step
const maxDisplacement = Math.max(...allCellDisplacements);
const equilibriumReached = maxDisplacement < equilibriumPrecision;
```

### **Step-wise Process**
1. **Stop Motion**: Reset all velocities and forces
2. **Analyze Acuteness**: Count acute angles for each cell
3. **Calculate Signals**: Apply threshold, mode, and power function
4. **Apply Forces**: Growing cells push neighbors, shrinking cells pull
5. **Balance**: Run physics until equilibrium or max steps
6. **Repeat**: Loop back to step 1

## 🚨 **Common Issues**

### **No Movement**
- **Cause**: Force Str too low, Rate too low, or no cells above/below threshold
- **Fix**: Increase Force Str to 2.0+, check threshold vs cell acuteness

### **Explosive Behavior**
- **Cause**: Force Str too high, Rate too high, or Damping too low
- **Fix**: Reduce Force Str to 1.5-2.5, increase Damping to 0.8+

### **Never Reaches Equilibrium**
- **Cause**: Precision too low, conflicting growth signals
- **Fix**: Increase Precision to 0.005+, reduce Max Steps to 50

### **Too Slow**
- **Cause**: Precision too low, Max Steps too high
- **Fix**: Increase Precision to 0.01, reduce Max Steps to 20-50

## 🎨 **Visual Feedback**

- **Cell Colors**: Blue = low acuteness, Red = high acuteness
- **Growing Cells**: Actively pushing neighbors away
- **Shrinking Cells**: Actively pulling neighbors closer
- **Static Cells**: No growth signal (acuteness near threshold)

---

*This physics-based system creates realistic cell expansion where growth actually affects neighboring cells, mimicking biological tissue dynamics.* 