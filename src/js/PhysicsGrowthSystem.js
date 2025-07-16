/**
 * PhysicsGrowthSystem.js
 * 
 * A physics-based growth system that combines acuteness analysis with realistic
 * cell expansion through neighbor force interactions.
 * 
 * Step-wise process:
 * a. Stop all motion (reset velocities/forces)
 * b. Calculate acuteness for all cells
 * c. Calculate growth strength based on acuteness vs threshold
 * d. Send growth signals to physics engine
 * e. Balance forces between cells until equilibrium
 * f. Loop back to step a
 */

import { PhysicsExpansion } from './PhysicsExpansion.js';

export class PhysicsGrowthSystem {
    constructor(config = {}) {
        // Growth configuration (similar to original GrowthSystem)
        this.config = {
            // Threshold for grow/shrink decision
            threshold: config.threshold || 5,
            // Growth mode: 'more_grow_only', 'more_grow_both', 'more_shrink_only', 'more_shrink_both'
            mode: config.mode || 'more_grow_both',
            // Power factor for non-linear growth (1 = linear, 2 = quadratic)
            growthPower: config.growthPower || 1.5,
            // Whether to normalize growth rates
            normalize: config.normalize !== undefined ? config.normalize : true,
            // Base growth rate multiplier (increased for more visible effect)
            baseGrowthRate: config.baseGrowthRate || 5.0,
            
            // Physics parameters (increased for stronger push-pull)
            forceStrength: config.forceStrength || 5.0,
            damping: config.damping || 0.85,
            maxForce: config.maxForce || 0.2,
            
            // Equilibrium detection
            equilibriumPrecision: config.equilibriumPrecision || 0.0005,
            maxPhysicsSteps: config.maxPhysicsSteps || 100,
            
            // Step mode: 'manual', 'auto', 'equilibrium', 'continuous'
            stepMode: config.stepMode || 'manual',
            
            // Physics steps between analysis updates (for continuous mode)
            physicsStepsPerAnalysis: config.physicsStepsPerAnalysis || 10
        };
        
        // Initialize physics engine
        this.physicsEngine = new PhysicsExpansion();
        this.physicsEngine.forceStrength = this.config.forceStrength;
        this.physicsEngine.damping = this.config.damping;
        this.physicsEngine.maxForce = this.config.maxForce;
        
        // State tracking
        this.isRunning = false;
        this.currentStep = 0;
        this.continuousMode = false;
        this.continuousIntervalId = null;
        this.physicsStepCounter = 0; // Track physics steps in continuous mode
        this.currentGrowthSignals = null; // Store growth signals between analyses
        this.stats = {
            totalDisplacement: 0,
            maxDisplacement: 0,
            activePoints: 0,
            growingPoints: 0,
            shrinkingPoints: 0,
            physicsSteps: 0,
            equilibriumReached: false
        };
    }
    
    /**
     * Main entry point - replaces the original GrowthSystem.applyGrowth()
     * Performs one complete step of the physics-based growth process
     */
    applyGrowth(points, computation, analysisResults) {
        if (!analysisResults || !analysisResults.cellScores) {
            console.warn('No analysis results available for growth');
            return points;
        }
        
        // Step a: Stop all motion
        this.physicsEngine.reset();
        
        // Step b: Calculate acuteness (already done in analysisResults)
        const cellScores = analysisResults.cellScores;
        
        // Step c: Calculate growth strength for each cell
        const growthSignals = this.calculateGrowthSignals(cellScores);
        
        // Step d: Send growth signals to physics engine
        this.applyGrowthSignals(growthSignals);
        
        // Step e: Balance forces between cells
        const result = this.balanceForces(points, computation);
        
        // Update statistics
        this.updateStats(result, growthSignals);
        
        return result.updatedPoints;
    }
    
    /**
     * Step c: Calculate growth strength based on acuteness vs threshold
     */
    calculateGrowthSignals(cellScores) {
        const growthSignals = new Map();
        let maxSignal = 0;
        
        // Reset stats
        this.stats.growingPoints = 0;
        this.stats.shrinkingPoints = 0;
        this.stats.activePoints = 0;
        
        for (let i = 0; i < cellScores.length; i++) {
            const score = cellScores[i] || 0;
            
            // Determine if this cell should grow or shrink based on mode and threshold
            let shouldGrow = false;
            let signalMagnitude = 0;
            
            switch (this.config.mode) {
                case 'more_grow_only':
                    // Only cells with more acute angles than threshold grow
                    if (score > this.config.threshold) {
                        shouldGrow = true;
                        signalMagnitude = score - this.config.threshold;
                    }
                    break;
                    
                case 'more_grow_both':
                    // More acute = grow, less acute = shrink
                    if (score > this.config.threshold) {
                        shouldGrow = true;
                        signalMagnitude = score - this.config.threshold;
                    } else if (score < this.config.threshold) {
                        shouldGrow = false;
                        signalMagnitude = this.config.threshold - score;
                    }
                    break;
                    
                case 'more_shrink_only':
                    // Only cells with more acute angles than threshold shrink
                    if (score > this.config.threshold) {
                        shouldGrow = false;
                        signalMagnitude = score - this.config.threshold;
                    }
                    break;
                    
                case 'more_shrink_both':
                    // More acute = shrink, less acute = grow
                    if (score > this.config.threshold) {
                        shouldGrow = false;
                        signalMagnitude = score - this.config.threshold;
                    } else if (score < this.config.threshold) {
                        shouldGrow = true;
                        signalMagnitude = this.config.threshold - score;
                    }
                    break;
            }
            
            // Apply non-linear growth function
            if (signalMagnitude > 0) {
                const rawSignal = Math.pow(signalMagnitude, this.config.growthPower) * (shouldGrow ? 1 : -1);
                growthSignals.set(i, rawSignal);
                maxSignal = Math.max(maxSignal, Math.abs(rawSignal));
                
                // Update stats
                this.stats.activePoints++;
                if (shouldGrow) {
                    this.stats.growingPoints++;
                } else {
                    this.stats.shrinkingPoints++;
                }
            }
        }
        
        // Normalize signals if requested
        if (this.config.normalize && maxSignal > 0) {
            growthSignals.forEach((signal, cellIndex) => {
                growthSignals.set(cellIndex, (signal / maxSignal) * this.config.baseGrowthRate);
            });
        } else {
            // Apply base growth rate scaling
            growthSignals.forEach((signal, cellIndex) => {
                growthSignals.set(cellIndex, signal * this.config.baseGrowthRate);
            });
        }
        
        return growthSignals;
    }
    
    /**
     * Step d: Send growth signals to physics engine
     */
    applyGrowthSignals(growthSignals) {
        // Clear all existing growth rates
        this.physicsEngine.clearGrowthRates();
        
        // Set growth rate for each cell with a signal
        growthSignals.forEach((signal, cellIndex) => {
            this.physicsEngine.setGrowthRate(cellIndex, signal);
        });
    }
    
    /**
     * Step e: Balance forces between cells until equilibrium
     */
    balanceForces(points, computation) {
        // Build Voronoi cells from computation
        const cells = this.buildVoronoiCells(points, computation);
        
        let currentPoints = points.map(p => [...p]); // Deep copy
        let physicsSteps = 0;
        let equilibriumReached = false;
        let maxDisplacement = 0;
        let totalDisplacement = 0;
        
        // Run physics steps until equilibrium or max steps reached
        while (physicsSteps < this.config.maxPhysicsSteps && !equilibriumReached) {
            const result = this.physicsEngine.applyPhysicsStep(currentPoints, cells);
            
            currentPoints = result.updatedPoints;
            maxDisplacement = Math.max(maxDisplacement, result.maxDisplacement);
            totalDisplacement += result.maxDisplacement;
            physicsSteps++;
            
            // Check for equilibrium
            if (result.maxDisplacement < this.config.equilibriumPrecision) {
                equilibriumReached = true;
            }
            
            // For manual mode, only do one step
            if (this.config.stepMode === 'manual') {
                break;
            }
        }
        
        return {
            updatedPoints: currentPoints,
            maxDisplacement,
            totalDisplacement,
            physicsSteps,
            equilibriumReached
        };
    }
    
    /**
     * Build Voronoi cells from computation for physics engine
     */
    buildVoronoiCells(points, computation) {
        const cells = [];
        
        // Initialize empty cells
        for (let i = 0; i < points.length; i++) {
            cells.push([]);
        }
        
        // Build cell vertices from tetrahedra barycenters
        if (computation.tetrahedra && computation.barycenters) {
            computation.tetrahedra.forEach((tet, index) => {
                const barycenter = computation.barycenters[index];
                if (!barycenter) return;
                
                tet.forEach(vertexIndex => {
                    if (cells[vertexIndex]) {
                        cells[vertexIndex].push(barycenter);
                    }
                });
            });
        }
        
        return cells;
    }
    
    /**
     * Update statistics after physics step
     */
    updateStats(result, growthSignals) {
        this.stats.totalDisplacement = result.totalDisplacement;
        this.stats.maxDisplacement = result.maxDisplacement;
        this.stats.physicsSteps = result.physicsSteps;
        this.stats.equilibriumReached = result.equilibriumReached;
        
        // Active points already calculated in calculateGrowthSignals
        this.stats.averageDisplacement = this.stats.activePoints > 0 ? 
            result.totalDisplacement / this.stats.activePoints : 0;
    }
    
    /**
     * Get current growth statistics
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * Reset the physics growth system
     */
    reset() {
        this.physicsEngine.reset();
        this.currentStep = 0;
        this.physicsStepCounter = 0;
        this.currentGrowthSignals = null;
        this.stats = {
            totalDisplacement: 0,
            maxDisplacement: 0,
            activePoints: 0,
            growingPoints: 0,
            shrinkingPoints: 0,
            physicsSteps: 0,
            equilibriumReached: false
        };
    }
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        
        // Update physics engine parameters
        if (newConfig.forceStrength !== undefined) {
            this.physicsEngine.forceStrength = newConfig.forceStrength;
        }
        if (newConfig.damping !== undefined) {
            this.physicsEngine.damping = newConfig.damping;
        }
        if (newConfig.maxForce !== undefined) {
            this.physicsEngine.maxForce = newConfig.maxForce;
        }
    }
    
    /**
     * Manual step function for step-by-step execution
     */
    performManualStep(points, computation, analysisResults) {
        this.config.stepMode = 'manual';
        return this.applyGrowth(points, computation, analysisResults);
    }
    
    /**
     * Auto step function for continuous execution
     */
    performAutoStep(points, computation, analysisResults) {
        this.config.stepMode = 'auto';
        return this.applyGrowth(points, computation, analysisResults);
    }
    
    /**
     * Equilibrium step function - runs until equilibrium reached
     */
    performEquilibriumStep(points, computation, analysisResults) {
        this.config.stepMode = 'equilibrium';
        return this.applyGrowth(points, computation, analysisResults);
    }
    
    /**
     * Start continuous mode - cells above threshold keep growing, below keep shrinking
     * System checks and updates after each iteration cycle
     */
    startContinuousMode(points, computation, analysisResults, updateCallback) {
        if (this.continuousMode) {
            console.log('Continuous mode already running');
            return;
        }
        
        this.continuousMode = true;
        this.config.stepMode = 'continuous';
        console.log('Starting continuous growth mode');
        
        // Store references for continuous updates
        this.continuousPoints = points;
        this.continuousComputation = computation;
        this.continuousCallback = updateCallback;
        
        // Start the continuous loop
        this.continuousStep();
    }
    
    /**
     * Stop continuous mode
     */
    stopContinuousMode() {
        if (this.continuousIntervalId) {
            clearTimeout(this.continuousIntervalId);
            this.continuousIntervalId = null;
        }
        this.continuousMode = false;
        this.physicsStepCounter = 0;
        this.currentGrowthSignals = null;
        console.log('Stopped continuous growth mode');
    }
    
    /**
     * Internal continuous step function
     */
    continuousStep() {
        if (!this.continuousMode) return;
        
        try {
            // Check if we need to recalculate acuteness
            if (this.physicsStepCounter === 0 || !this.currentGrowthSignals) {
                // Time to recalculate acuteness and growth signals
                console.log(`Recalculating acuteness after ${this.config.physicsStepsPerAnalysis} physics steps`);
                
                if (this.continuousCallback) {
                    // Let the main app handle the analysis and get results
                    this.continuousCallback(() => {
                        // Reset counter for next cycle
                        this.physicsStepCounter = 0;
                        // Continue with next step
                        this.scheduleContinuousStep();
                    });
                } else {
                    // Fallback - just schedule next step
                    this.scheduleContinuousStep();
                }
            } else {
                // Just run physics without recalculating acuteness
                console.log(`Physics step ${this.physicsStepCounter}/${this.config.physicsStepsPerAnalysis}`);
                
                if (this.continuousCallback) {
                    // Run physics step without analysis
                    this.continuousCallback(() => {
                        this.scheduleContinuousStep();
                    }, true); // true = skip analysis
                } else {
                    this.scheduleContinuousStep();
                }
            }
        } catch (error) {
            console.error('Error in continuous step:', error);
            this.stopContinuousMode();
        }
    }
    
    /**
     * Schedule the next continuous step
     */
    scheduleContinuousStep() {
        if (!this.continuousMode) return;
        
        // Schedule next step with a small delay to prevent blocking
        this.continuousIntervalId = setTimeout(() => {
            this.continuousStep();
        }, 100); // 100ms delay between steps
    }
    
    /**
     * Perform continuous step with updated analysis results
     */
    performContinuousStep(points, computation, analysisResults, skipAnalysis = false) {
        if (!this.continuousMode) return points;
        
        let result;
        
        if (!skipAnalysis && analysisResults) {
            // New analysis available - calculate and store growth signals
            this.currentGrowthSignals = this.calculateGrowthSignals(analysisResults.cellScores);
            this.applyGrowthSignals(this.currentGrowthSignals);
            this.physicsStepCounter = 0;
        }
        
        // Always run physics step with current growth signals
        if (this.currentGrowthSignals) {
            result = this.balanceForces(points, computation);
            this.updateStats(result, this.currentGrowthSignals);
            this.physicsStepCounter++;
            
            // Check if we've done enough physics steps
            if (this.physicsStepCounter >= this.config.physicsStepsPerAnalysis) {
                this.physicsStepCounter = 0; // Reset for next cycle
            }
            
            return result.updatedPoints;
        }
        
        return points;
    }
    
    /**
     * Check if continuous mode is active
     */
    isContinuousMode() {
        return this.continuousMode;
    }
} 