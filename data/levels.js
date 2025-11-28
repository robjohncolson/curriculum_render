/**
 * Study Buddy Level Definitions
 *
 * Each unit has its own level configuration that defines:
 * - roomWidth: Total width of the room in pixels
 * - incline: { startX, endX, height } - The ramp from ground to cliff top
 *   - startX: Where the incline starts (bottom)
 *   - endX: Where the incline ends (cliff edge / drop-off point)
 *   - height: How tall the cliff is
 *   - null for Unit 1 (no incline needed)
 * - door: { x, elevation } - Door X position and extra elevation above block stack
 * - blockSpawn: { x, y } - Independent spawn position
 *   - x: Absolute X position in room
 *   - y: Height from ground level
 *   - null for Unit 1 (no blocks)
 *
 * This file can be edited by the Level Editor (level_editor.html)
 */

const STUDY_BUDDY_LEVELS = {
  "unit1": {
    "roomWidth": 1200,
    "incline": null,
    "door": { "x": 1080, "elevation": 0 },
    "blockSpawn": null
  },
  "unit2": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit3": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit4": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit5": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit6": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit7": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit8": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  },
  "unit9": {
    "roomWidth": 1200,
    "incline": { "startX": 50, "endX": 800, "height": 250 },
    "door": { "x": 1080, "elevation": 30 },
    "blockSpawn": { "x": 650, "y": 250 }
  }
};

// Export for browser
if (typeof window !== 'undefined') {
  window.STUDY_BUDDY_LEVELS = STUDY_BUDDY_LEVELS;
}
