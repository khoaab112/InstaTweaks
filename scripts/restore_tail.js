const fs = require('fs');
const path = require('path');

function ensureCoreComplete() {
  let core = fs.readFileSync('scripts/studio_core.js', 'utf8');
  let truncIdx = core.indexOf('...[truncated for diff preview]');
  if (truncIdx === -1) {
    truncIdx = core.indexOf('... [truncated for diff preview]');
  }
  if (truncIdx === -1) {
    return;
  }

  const bridge = `          atColor = '#38bdf8';
          txtColor = '#ffffff';
        } else if (mStyle === 'gradient') {
          atColor = '#ffffff';
          txtColor = '#ffffff';
        }

        ctx.fillStyle = atColor;
        ctx.fillText(atChar, textStartX, 1 * scale);
        const atWidth = ctx.measureText(atChar).width;
        ctx.fillStyle = txtColor;
        ctx.fillText(uText, textStartX + atWidth, 1 * scale);

      } else if (s.type === 'location') {
        const text = s.name || 'Địa điểm';
        const fontSize = Math.round(13 * scale);
        ctx.font = \`bold \${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\`;
        const textMetrics = ctx.measureText(text);
        const iconPad = Math.round(16 * scale);
        const pillW = textMetrics.width + Math.round(32 * scale) + iconPad;
        const pillH = fontSize + Math.round(14 * scale);
        const radius = pillH / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = Math.round(8 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        drawRoundedRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
        ctx.fill();
        ctx.restore();

        // Icon vị trí màu đỏ hồng
        ctx.fillStyle = '#e1306c';
        ctx.beginPath();
        ctx.arc(-pillW / 2 + Math.round(16 * scale), 0, Math.round(4.5 * scale), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.`;

  const tail = fs.readFileSync(path.join(__dirname, 'studio_parts', 'tail_after_render_canvas.js'), 'utf8');
  core = core.slice(0, truncIdx) + bridge + tail;
  fs.writeFileSync('scripts/studio_core.js', core, 'utf8');
  console.log('Restored truncated core tail. New length:', core.length);
}

module.exports = { ensureCoreComplete };
if (require.main === module) {
  ensureCoreComplete();
}
