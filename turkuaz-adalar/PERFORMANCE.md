# Mobile Performance Optimization

## Quality Settings

The game supports three quality levels with different performance trade-offs:

### Low Quality

- **Target**: Older mobile devices (3GB RAM, low-end GPUs)
- **Antialias**: Disabled
- **Pixel Ratio**: 1x
- **Shadow Map**: 512px, BasicShadowMap
- **Particle Multiplier**: 0.4x (40% of normal particle count)
- **Geometry Detail**: 0.5x
- **Texture Compression**: Enabled

### Medium Quality (Default)

- **Target**: Mid-range mobile devices (4-6GB RAM)
- **Antialias**: Enabled
- **Pixel Ratio**: 1.5x
- **Shadow Map**: 1024px, PCFShadowMap
- **Particle Multiplier**: 0.7x (70% of normal particle count)
- **Geometry Detail**: 0.75x
- **Texture Compression**: Enabled

### High Quality

- **Target**: Flagship devices (6GB+ RAM, modern GPUs)
- **Antialias**: Enabled
- **Pixel Ratio**: 2x
- **Shadow Map**: 2048px, PCFSoftShadowMap
- **Particle Multiplier**: 1.0x (full particle count)
- **Geometry Detail**: 1.0x
- **Texture Compression**: Disabled

## Auto-Detection

The game automatically detects the appropriate quality level based on:

- Device memory (via `navigator.deviceMemory`)
- GPU renderer string (via WebGL context)
- Mobile device detection

Detection logic:

- Mobile + < 3GB RAM or low-end GPU → Low
- Mobile + < 6GB RAM → Medium
- Desktop + < 4GB RAM → Medium
- Otherwise → High

## Performance Monitoring

A `PerformanceMonitor` class tracks:

- **FPS**: Frames per second (updated every second)
- **Frame Time**: Time per frame in milliseconds
- **Memory Used**: JS heap size in MB
- **Memory Total**: Total JS heap size in MB
- **Memory Limit**: JS heap size limit in MB
- **Memory Fraction**: Used memory as fraction of limit

To access metrics in the console:

```javascript
// In browser console
const game = window.__turkuaz // dev builds only (npm run dev)
const metrics = game.getPerformanceMetrics()
console.log('FPS:', metrics.fps)
console.log('Memory:', metrics.memoryUsed, 'MB')
```

## Mobile Responsive Design

### Safe Areas

The game respects device safe areas (notches, home indicators):

- Uses CSS custom properties `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right`
- Automatically detected from `env(safe-area-inset-*)`

### Portrait Mode

- CSS media query for `orientation: portrait`
- Flex column layout for portrait screens
- Full-height viewport support

### Touch Handling

- `touch-action: none` to prevent browser gestures
- `-webkit-tap-highlight-color: transparent` to remove tap highlights
- `overscroll-behavior: none` to prevent scroll bounce

## Optimizations Implemented

### Rendering

- **Shadow Optimization**: Shadow map size scales with quality
- **Pixel Ratio Capping**: Prevents unnecessary high-DPI rendering
- **Antialias Toggle**: Disabled on low quality to save GPU time

### Particles

- **Quality Multiplier**: Particle counts scale with quality level
- **Object Pooling**: No runtime allocation during gameplay
- **Buffer Reuse**: Preallocated Float32Array buffers

### Memory

- **Auto-Save Debouncing**: 1-second delay prevents excessive writes
- **Resource Disposal**: WebGL resources disposed on game shutdown
- **Object Pooling**: Reused geometry/materials instead of creating new ones

### Allocation

- **No Runtime Allocation**: Pooled systems avoid GC pressure
- **Preallocated Buffers**: Fixed-size buffers for particles

## Testing

### Frame Rate Testing

1. Open DevTools (F12)
2. Go to Performance tab
3. Record a gameplay session
4. Analyze FPS stability and frame time variance

### Memory Testing

1. Open DevTools Memory tab
2. Take heap snapshot before gameplay
3. Play for 5-10 minutes
4. Take heap snapshot after gameplay
5. Compare for memory leaks

### Long Gameplay Testing

1. Play continuously for 30+ minutes
2. Monitor FPS stability
3. Check for memory growth
4. Verify no performance degradation over time

### Asset Loading Testing

1. Clear browser cache
2. Monitor Network tab during initial load
3. Check asset sizes and load times
4. Verify no unnecessary asset loading

## Recommendations

### For Low-End Devices

- Quality automatically set to Low
- Consider reducing particle count further if needed
- Monitor FPS and adjust quality manually in settings

### For Mid-Range Devices

- Medium quality provides good balance
- 60 FPS target achievable on most modern phones
- Particle effects at 70% scale

### For High-End Devices

- High quality enables full visual fidelity
- 120 FPS possible on 120Hz displays
- Full particle effects and soft shadows

## Future Improvements

- [ ] Add dynamic quality adjustment based on FPS
- [ ] Implement texture streaming for large assets
- [ ] Add LOD (Level of Detail) system for distant objects
- [ ] Implement GPU instancing for repeated geometry
- [ ] Add adaptive quality based on thermal throttling
- [ ] Implement background loading for next level
