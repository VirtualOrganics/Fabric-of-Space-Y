/**
 * PhysicsExpansion.js
 * 
 * A physics-based cell expansion system where growing cells actually push their neighbors away.
 * This creates real expansion effects rather than just moving cells around.
 */

export class PhysicsExpansion {
    constructor() {
        // Physics parameters
        this.forceStrength = 0.5;
        this.damping = 0.8;
        this.maxForce = 0.5;  // Increased from 0.1 for stronger forces
        this.minDistance = 0.01;
        
        // State tracking
        this.forces = new Map(); // cellIndex -> {x, y, z}
        this.velocities = new Map(); // cellIndex -> {x, y, z}
        this.growthRates = new Map(); // cellIndex -> growth rate
        
        // Neighbor cache
        this.neighborCache = new Map(); // cellIndex -> Set of neighbor indices
        this.neighborCacheValid = false;
    }
    
    /**
     * Find all neighbors of a cell (cells that share a Voronoi edge)
     */
    findCellNeighbors(cellIndex, voronoiCells) {
        if (!this.neighborCacheValid) {
            this.rebuildNeighborCache(voronoiCells);
        }
        return this.neighborCache.get(cellIndex) || new Set();
    }
    
    /**
     * Rebuild the neighbor cache from Voronoi cells
     */
    rebuildNeighborCache(voronoiCells) {
        this.neighborCache.clear();
        
        // Initialize empty sets for all cells
        voronoiCells.forEach((_, index) => {
            this.neighborCache.set(index, new Set());
        });
        
        // For each cell, check which other cells share vertices
        voronoiCells.forEach((cell1, index1) => {
            voronoiCells.forEach((cell2, index2) => {
                if (index1 >= index2) return; // Skip self and already processed pairs
                
                // Check if cells share any vertices (indicating shared edge)
                const sharedVertices = this.countSharedVertices(cell1, cell2);
                
                // In 3D, cells sharing 2 or more vertices share an edge
                // In 2D, cells sharing 2 vertices share an edge
                if (sharedVertices >= 2) {
                    this.neighborCache.get(index1).add(index2);
                    this.neighborCache.get(index2).add(index1);
                }
            });
        });
        
        this.neighborCacheValid = true;
    }
    
    /**
     * Count shared vertices between two cells
     */
    countSharedVertices(cell1, cell2) {
        let count = 0;
        
        // Extract vertices from cell structure
        const vertices1 = this.extractVertices(cell1);
        const vertices2 = this.extractVertices(cell2);
        
        for (const v1 of vertices1) {
            for (const v2 of vertices2) {
                // Check if vertices are the same (within small tolerance)
                const dx = Math.abs(v1[0] - v2[0]);
                const dy = Math.abs(v1[1] - v2[1]);
                const dz = Math.abs(v1[2] - v2[2]);
                
                if (dx < 0.0001 && dy < 0.0001 && dz < 0.0001) {
                    count++;
                    break;
                }
            }
        }
        
        return count;
    }
    
    /**
     * Extract vertices from cell structure
     */
    extractVertices(cell) {
        // If cell is already an array of vertices
        if (Array.isArray(cell) && cell.length > 0 && Array.isArray(cell[0])) {
            return cell;
        }
        
        // If cell has faces property (typical Voronoi structure)
        if (cell.faces && Array.isArray(cell.faces)) {
            const vertices = [];
            const vertexSet = new Set();
            
            cell.faces.forEach(face => {
                if (face.vertices) {
                    face.vertices.forEach(v => {
                        const key = `${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)}`;
                        if (!vertexSet.has(key)) {
                            vertexSet.add(key);
                            vertices.push(v);
                        }
                    });
                }
            });
            
            return vertices;
        }
        
        // If cell has vertices property
        if (cell.vertices && Array.isArray(cell.vertices)) {
            return cell.vertices;
        }
        
        return [];
    }
    
    /**
     * Calculate the force vector from one cell to another
     */
    calculateForce(fromPoint, toPoint, growthRate) {
        // Calculate direction vector
        const dx = toPoint[0] - fromPoint[0];
        const dy = toPoint[1] - fromPoint[1];
        const dz = toPoint[2] - fromPoint[2];
        
        // Calculate distance
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Avoid division by zero
        if (distance < this.minDistance) {
            return { x: 0, y: 0, z: 0 };
        }
        
        // Normalize direction
        const nx = dx / distance;
        const ny = dy / distance;
        const nz = dz / distance;
        
        // Calculate force magnitude
        // Force is stronger when cells are closer (inverse square law)
        // Positive growth rate = push away (positive force along direction)
        // Negative growth rate = pull together (negative force along direction)
        const forceMagnitude = (growthRate * this.forceStrength) / (distance * distance);
        
        // Clamp force magnitude while preserving sign
        const clampedMagnitude = Math.sign(forceMagnitude) * Math.min(Math.abs(forceMagnitude), this.maxForce);
        
        return {
            x: nx * clampedMagnitude,
            y: ny * clampedMagnitude,
            z: nz * clampedMagnitude
        };
    }
    
    /**
     * Set growth rate for a specific cell
     */
    setGrowthRate(cellIndex, rate) {
        if (rate === 0) {
            this.growthRates.delete(cellIndex);
        } else {
            this.growthRates.set(cellIndex, rate);
        }
    }
    
    /**
     * Clear all growth rates
     */
    clearGrowthRates() {
        this.growthRates.clear();
    }
    
    /**
     * Apply physics step to update generator positions
     */
    applyPhysicsStep(generatorPoints, voronoiCells, deltaTime = 0.016) {
        // Clear forces
        this.forces.clear();
        
        // Initialize forces for all points
        generatorPoints.forEach((_, index) => {
            this.forces.set(index, { x: 0, y: 0, z: 0 });
        });
        
        // Calculate forces between ALL cells with growth rates
        // This ensures proper push-pull dynamics
        const cellsWithGrowth = Array.from(this.growthRates.keys());
        
        // Process each pair of cells only once
        for (let i = 0; i < cellsWithGrowth.length; i++) {
            const cellIndexA = cellsWithGrowth[i];
            const growthRateA = this.growthRates.get(cellIndexA);
            if (Math.abs(growthRateA) < 0.001) continue;
            
            const pointA = generatorPoints[cellIndexA];
            const neighborsA = this.findCellNeighbors(cellIndexA, voronoiCells);
            
            neighborsA.forEach(cellIndexB => {
                // Check if neighbor also has a growth rate
                const growthRateB = this.growthRates.get(cellIndexB) || 0;
                
                const pointB = generatorPoints[cellIndexB];
                
                // Calculate base force from A to B
                const forceAtoB = this.calculateForce(pointA, pointB, growthRateA);
                
                // If B also has growth, calculate its force contribution
                let forceBtoA = { x: 0, y: 0, z: 0 };
                if (Math.abs(growthRateB) > 0.001) {
                    forceBtoA = this.calculateForce(pointB, pointA, growthRateB);
                }
                
                // Apply forces with proper amplification
                // Growing cells (positive rate) push away from each other
                // Shrinking cells (negative rate) pull towards each other
                
                // Force on B from A
                const forceB = this.forces.get(cellIndexB);
                forceB.x += forceAtoB.x;
                forceB.y += forceAtoB.y;
                forceB.z += forceAtoB.z;
                
                // Force on A from B (Newton's third law - equal and opposite)
                const forceA = this.forces.get(cellIndexA);
                forceA.x -= forceAtoB.x;
                forceA.y -= forceAtoB.y;
                forceA.z -= forceAtoB.z;
                
                // If B is also active, add its contribution
                if (Math.abs(growthRateB) > 0.001) {
                    // B's force on A
                    forceA.x += forceBtoA.x;
                    forceA.y += forceBtoA.y;
                    forceA.z += forceBtoA.z;
                    
                    // A's reaction to B's force
                    forceB.x -= forceBtoA.x;
                    forceB.y -= forceBtoA.y;
                    forceB.z -= forceBtoA.z;
                }
            });
        }
        
        // Update velocities and positions
        const updatedPoints = [];
        let maxDisplacement = 0;
        let totalForce = 0;
        
        generatorPoints.forEach((point, index) => {
            const force = this.forces.get(index) || { x: 0, y: 0, z: 0 };
            let velocity = this.velocities.get(index) || { x: 0, y: 0, z: 0 };
            
            // Update velocity with force (F = ma, assuming m = 1)
            velocity.x += force.x * deltaTime;
            velocity.y += force.y * deltaTime;
            velocity.z += force.z * deltaTime;
            
            // Apply damping
            velocity.x *= this.damping;
            velocity.y *= this.damping;
            velocity.z *= this.damping;
            
            // Store updated velocity
            this.velocities.set(index, velocity);
            
            // Update position
            const newX = point[0] + velocity.x * deltaTime;
            const newY = point[1] + velocity.y * deltaTime;
            const newZ = point[2] + velocity.z * deltaTime;
            
            updatedPoints.push([newX, newY, newZ]);
            
            // Track statistics
            const displacement = Math.sqrt(
                velocity.x * velocity.x + 
                velocity.y * velocity.y + 
                velocity.z * velocity.z
            ) * deltaTime;
            maxDisplacement = Math.max(maxDisplacement, displacement);
            
            const forceMagnitude = Math.sqrt(
                force.x * force.x + 
                force.y * force.y + 
                force.z * force.z
            );
            totalForce += forceMagnitude;
        });
        
        // Invalidate neighbor cache since positions changed
        this.neighborCacheValid = false;
        
        return {
            updatedPoints,
            maxDisplacement,
            averageForce: totalForce / generatorPoints.length
        };
    }
    
    /**
     * Get force vectors for visualization
     */
    getForceVectors() {
        const vectors = [];
        
        this.forces.forEach((force, index) => {
            const magnitude = Math.sqrt(force.x * force.x + force.y * force.y + force.z * force.z);
            if (magnitude > 0.001) {
                vectors.push({
                    index,
                    force,
                    magnitude
                });
            }
        });
        
        return vectors;
    }
    
    /**
     * Reset all physics state
     */
    reset() {
        this.forces.clear();
        this.velocities.clear();
        this.growthRates.clear();
        this.neighborCache.clear();
        this.neighborCacheValid = false;
    }
} 