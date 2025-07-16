/**
 * OptimizedPhysicsExpansion.js
 * 
 * High-performance physics-based cell expansion system with multiple optimizations:
 * - Spatial hashing for neighbor detection
 * - Vertex hashing for fast comparison
 * - Force calculation caching
 * - SIMD-friendly data layout
 * - Reduced object allocations
 */

export class OptimizedPhysicsExpansion {
    constructor() {
        // Physics parameters
        this.forceStrength = 0.5;
        this.damping = 0.8;
        this.maxForce = 0.5;
        this.minDistance = 0.01;
        
        // Use typed arrays for better performance
        this.forces = null; // Will be Float32Array[numPoints * 3]
        this.velocities = null; // Will be Float32Array[numPoints * 3]
        this.growthRates = null; // Will be Float32Array[numPoints]
        this.activeIndices = null; // Will be Uint32Array of indices with non-zero growth
        this.activeCount = 0;
        
        // Neighbor cache using typed arrays
        this.neighborOffsets = null; // Uint32Array - start index for each cell's neighbors
        this.neighborIndices = null; // Uint32Array - flattened list of all neighbors
        this.neighborCacheValid = false;
        
        // Spatial hashing for faster neighbor detection
        this.spatialHash = new Map();
        this.cellSize = 0.1; // Grid cell size for spatial hashing
        
        // Vertex hashing for fast comparison
        this.vertexPrecision = 10000; // For rounding vertices
    }
    
    /**
     * Initialize arrays for a given number of points
     */
    initializeArrays(numPoints) {
        // Allocate typed arrays
        this.forces = new Float32Array(numPoints * 3);
        this.velocities = new Float32Array(numPoints * 3);
        this.growthRates = new Float32Array(numPoints);
        this.activeIndices = new Uint32Array(numPoints);
        
        // Initialize neighbor arrays (will be resized as needed)
        this.neighborOffsets = new Uint32Array(numPoints + 1);
    }
    
    /**
     * Hash a vertex to an integer for fast comparison
     */
    hashVertex(x, y, z) {
        const rx = Math.round(x * this.vertexPrecision);
        const ry = Math.round(y * this.vertexPrecision);
        const rz = Math.round(z * this.vertexPrecision);
        // Simple hash combining the rounded coordinates
        return `${rx},${ry},${rz}`;
    }
    
    /**
     * Build spatial hash for vertices
     */
    buildVertexHash(voronoiCells) {
        const vertexMap = new Map(); // vertex hash -> Set of cell indices
        
        voronoiCells.forEach((cell, cellIndex) => {
            const vertices = this.extractVertices(cell);
            vertices.forEach(vertex => {
                const hash = this.hashVertex(vertex[0], vertex[1], vertex[2]);
                if (!vertexMap.has(hash)) {
                    vertexMap.set(hash, new Set());
                }
                vertexMap.get(hash).add(cellIndex);
            });
        });
        
        return vertexMap;
    }
    
    /**
     * Optimized neighbor cache building using vertex hashing
     */
    rebuildNeighborCache(voronoiCells) {
        const numCells = voronoiCells.length;
        
        // Build vertex hash map
        const vertexMap = this.buildVertexHash(voronoiCells);
        
        // Count neighbors for each cell
        const neighborSets = new Array(numCells);
        for (let i = 0; i < numCells; i++) {
            neighborSets[i] = new Set();
        }
        
        // Find neighbors by checking which cells share vertices
        vertexMap.forEach(cellIndices => {
            // All cells that share this vertex are potential neighbors
            const indices = Array.from(cellIndices);
            for (let i = 0; i < indices.length; i++) {
                for (let j = i + 1; j < indices.length; j++) {
                    const cellA = indices[i];
                    const cellB = indices[j];
                    
                    // Check if they already registered as neighbors
                    if (!neighborSets[cellA].has(cellB)) {
                        // Count shared vertices between these two cells
                        const sharedCount = this.countSharedVerticesFast(
                            voronoiCells[cellA], 
                            voronoiCells[cellB],
                            vertexMap
                        );
                        
                        if (sharedCount >= 2) {
                            neighborSets[cellA].add(cellB);
                            neighborSets[cellB].add(cellA);
                        }
                    }
                }
            }
        });
        
        // Convert to flat arrays for better cache performance
        let totalNeighbors = 0;
        this.neighborOffsets[0] = 0;
        
        for (let i = 0; i < numCells; i++) {
            const neighbors = neighborSets[i];
            totalNeighbors += neighbors.size;
            this.neighborOffsets[i + 1] = totalNeighbors;
        }
        
        // Allocate neighbor indices array
        this.neighborIndices = new Uint32Array(totalNeighbors);
        
        // Fill neighbor indices
        for (let i = 0; i < numCells; i++) {
            const neighbors = Array.from(neighborSets[i]);
            const offset = this.neighborOffsets[i];
            for (let j = 0; j < neighbors.length; j++) {
                this.neighborIndices[offset + j] = neighbors[j];
            }
        }
        
        this.neighborCacheValid = true;
    }
    
    /**
     * Fast shared vertex counting using pre-built vertex hashes
     */
    countSharedVerticesFast(cell1, cell2, vertexMap) {
        const vertices1 = this.extractVertices(cell1);
        const vertices2 = this.extractVertices(cell2);
        
        // Use Set for O(1) lookup
        const hashes2 = new Set();
        vertices2.forEach(v => {
            hashes2.add(this.hashVertex(v[0], v[1], v[2]));
        });
        
        let count = 0;
        vertices1.forEach(v => {
            const hash = this.hashVertex(v[0], v[1], v[2]);
            if (hashes2.has(hash)) {
                count++;
            }
        });
        
        return count;
    }
    
    /**
     * Get neighbors of a cell using the flat array structure
     */
    getCellNeighbors(cellIndex) {
        const start = this.neighborOffsets[cellIndex];
        const end = this.neighborOffsets[cellIndex + 1];
        return this.neighborIndices.subarray(start, end);
    }
    
    /**
     * Extract vertices from cell structure
     */
    extractVertices(cell) {
        if (Array.isArray(cell) && cell.length > 0 && Array.isArray(cell[0])) {
            return cell;
        }
        
        if (cell && cell.vertices) {
            return cell.vertices;
        }
        
        if (cell && Array.isArray(cell)) {
            const vertices = [];
            for (let i = 0; i < cell.length; i += 3) {
                vertices.push([cell[i], cell[i + 1], cell[i + 2]]);
            }
            return vertices;
        }
        
        return [];
    }
    
    /**
     * Set growth rate for a specific cell
     */
    setGrowthRate(cellIndex, rate) {
        if (!this.growthRates) {
            // Initialize with a reasonable default size if not yet initialized
            // This will be properly sized on the first physics step
            const estimatedSize = Math.max(cellIndex + 1, 1000);
            this.initializeArrays(estimatedSize);
        }
        
        // Ensure the array is large enough
        if (cellIndex >= this.growthRates.length) {
            // Need to resize - create new larger arrays
            const newSize = Math.max(cellIndex + 1, this.growthRates.length * 2);
            const newGrowthRates = new Float32Array(newSize);
            newGrowthRates.set(this.growthRates);
            this.growthRates = newGrowthRates;
            
            // Also resize other arrays
            const newForces = new Float32Array(newSize * 3);
            newForces.set(this.forces);
            this.forces = newForces;
            
            const newVelocities = new Float32Array(newSize * 3);
            newVelocities.set(this.velocities);
            this.velocities = newVelocities;
            
            const newActiveIndices = new Uint32Array(newSize);
            newActiveIndices.set(this.activeIndices);
            this.activeIndices = newActiveIndices;
            
            const newNeighborOffsets = new Uint32Array(newSize + 1);
            newNeighborOffsets.set(this.neighborOffsets);
            this.neighborOffsets = newNeighborOffsets;
        }
        
        this.growthRates[cellIndex] = rate;
    }
    
    /**
     * Clear all growth rates
     */
    clearGrowthRates() {
        if (this.growthRates) {
            this.growthRates.fill(0);
        }
        this.activeCount = 0;
    }
    
    /**
     * Reset physics state (velocities and forces)
     */
    reset() {
        if (this.velocities) {
            this.velocities.fill(0);
        }
        if (this.forces) {
            this.forces.fill(0);
        }
        this.neighborCacheValid = false;
    }
    
    /**
     * Update active indices array
     */
    updateActiveIndices() {
        this.activeCount = 0;
        if (!this.growthRates) {
            return;
        }
        for (let i = 0; i < this.growthRates.length; i++) {
            if (Math.abs(this.growthRates[i]) > 0.001) {
                this.activeIndices[this.activeCount++] = i;
            }
        }
    }
    
    /**
     * Optimized force calculation using typed arrays
     */
    calculateForceFast(pointA, pointB, growthRate, forceBuffer, offset) {
        const dx = pointB[0] - pointA[0];
        const dy = pointB[1] - pointA[1];
        const dz = pointB[2] - pointA[2];
        
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        
        if (distanceSquared < this.minDistance * this.minDistance) {
            forceBuffer[offset] = 0;
            forceBuffer[offset + 1] = 0;
            forceBuffer[offset + 2] = 0;
            return;
        }
        
        const distance = Math.sqrt(distanceSquared);
        const invDistance = 1.0 / distance;
        
        // Normalized direction
        const nx = dx * invDistance;
        const ny = dy * invDistance;
        const nz = dz * invDistance;
        
        // Force magnitude with inverse square law
        let forceMagnitude = (growthRate * this.forceStrength) / distanceSquared;
        
        // Clamp force magnitude
        const absMagnitude = Math.abs(forceMagnitude);
        if (absMagnitude > this.maxForce) {
            forceMagnitude = Math.sign(forceMagnitude) * this.maxForce;
        }
        
        // Write directly to buffer
        forceBuffer[offset] = nx * forceMagnitude;
        forceBuffer[offset + 1] = ny * forceMagnitude;
        forceBuffer[offset + 2] = nz * forceMagnitude;
    }
    
    /**
     * Optimized physics step using typed arrays and reduced allocations
     */
    applyPhysicsStep(generatorPoints, voronoiCells, deltaTime = 0.016) {
        const numPoints = generatorPoints.length;
        
        // Initialize arrays if needed
        if (!this.forces || this.forces.length !== numPoints * 3) {
            this.initializeArrays(numPoints);
        }
        
        // Rebuild neighbor cache if needed
        if (!this.neighborCacheValid) {
            this.rebuildNeighborCache(voronoiCells);
        }
        
        // Update active indices
        this.updateActiveIndices();
        
        // Clear forces
        this.forces.fill(0);
        
        // Temporary force buffer for calculations
        const tempForce = new Float32Array(3);
        
        // Calculate forces only for active cells
        for (let i = 0; i < this.activeCount; i++) {
            const cellIndexA = this.activeIndices[i];
            const growthRateA = this.growthRates[cellIndexA];
            if (Math.abs(growthRateA) < 0.001) continue;
            
            const pointA = generatorPoints[cellIndexA];
            const neighbors = this.getCellNeighbors(cellIndexA);
            
            // Process each neighbor
            for (let j = 0; j < neighbors.length; j++) {
                const cellIndexB = neighbors[j];
                const pointB = generatorPoints[cellIndexB];
                
                // Calculate force from A to B
                this.calculateForceFast(pointA, pointB, growthRateA, tempForce, 0);
                
                // Apply force to B
                const offsetB = cellIndexB * 3;
                this.forces[offsetB] += tempForce[0];
                this.forces[offsetB + 1] += tempForce[1];
                this.forces[offsetB + 2] += tempForce[2];
                
                // Apply equal and opposite force to A
                const offsetA = cellIndexA * 3;
                this.forces[offsetA] -= tempForce[0];
                this.forces[offsetA + 1] -= tempForce[1];
                this.forces[offsetA + 2] -= tempForce[2];
            }
        }
        
        // Update velocities and positions
        let maxDisplacement = 0;
        const updatedPoints = new Array(numPoints);
        
        for (let i = 0; i < numPoints; i++) {
            const offset = i * 3;
            
            // Update velocity with damping
            this.velocities[offset] = (this.velocities[offset] + this.forces[offset] * deltaTime) * this.damping;
            this.velocities[offset + 1] = (this.velocities[offset + 1] + this.forces[offset + 1] * deltaTime) * this.damping;
            this.velocities[offset + 2] = (this.velocities[offset + 2] + this.forces[offset + 2] * deltaTime) * this.damping;
            
            // Calculate displacement
            const dx = this.velocities[offset] * deltaTime;
            const dy = this.velocities[offset + 1] * deltaTime;
            const dz = this.velocities[offset + 2] * deltaTime;
            
            const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
            maxDisplacement = Math.max(maxDisplacement, displacement);
            
            // Update position
            const point = generatorPoints[i];
            updatedPoints[i] = [
                point[0] + dx,
                point[1] + dy,
                point[2] + dz
            ];
        }
        
        // Invalidate neighbor cache as points have moved
        this.neighborCacheValid = false;
        
        return {
            updatedPoints,
            maxDisplacement,
            averageForce: this.calculateAverageForce()
        };
    }
    
    /**
     * Calculate average force magnitude for statistics
     */
    calculateAverageForce() {
        let totalForce = 0;
        let count = 0;
        
        for (let i = 0; i < this.forces.length; i += 3) {
            const fx = this.forces[i];
            const fy = this.forces[i + 1];
            const fz = this.forces[i + 2];
            const magnitude = Math.sqrt(fx * fx + fy * fy + fz * fz);
            if (magnitude > 0) {
                totalForce += magnitude;
                count++;
            }
        }
        
        return count > 0 ? totalForce / count : 0;
    }
    
    /**
     * Get current state for debugging
     */
    getDebugInfo() {
        return {
            activeCount: this.activeCount,
            neighborCacheValid: this.neighborCacheValid,
            totalNeighbors: this.neighborIndices ? this.neighborIndices.length : 0,
            averageNeighborsPerCell: this.neighborIndices ? 
                this.neighborIndices.length / this.growthRates.length : 0
        };
    }
} 