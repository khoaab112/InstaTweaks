fillText(text, -pillW / 2 + Math.round(26 * scale), 1 * scale);

      } else if (s.type === 'poll') {
        const cardW = Math.round(200 * scale);
        const cardH = Math.round(86 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Question
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(13 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.question || 'Bình chọn ngay?', 0, -cardH / 2 + Math.round(22 * scale));

        // Option boxes
        const optW = Math.round(84 * scale);
        const optH = Math.round(32 * scale);
        const optY = Math.round(12 * scale);

        // Opt A
        ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
        drawRoundedRect(ctx, -cardW / 2 + Math.round(12 * scale), optY, optW, optH, Math.round(8 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#0284c7';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.optA || 'CÓ 👍', -cardW / 2 + Math.round(12 * scale) + optW / 2, optY + optH / 2);

        // Opt B
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
        drawRoundedRect(ctx, cardW / 2 - Math.round(12 * scale) - optW, optY, optW, optH, Math.round(8 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillText(s.optB || 'KHÔNG 👎', cardW / 2 - Math.round(12 * scale) - optW / 2, optY + optH / 2);

      } else if (s.type === 'question') {
        const cardW = Math.round(210 * scale);
        const cardH = Math.round(82 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Header
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(12.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.header || 'Hỏi tôi một điều gì đó...', 0, -cardH / 2 + Math.round(22 * scale));

        // Body input box mockup
        const bW = Math.round(186 * scale);
        const bH = Math.round(30 * scale);
        ctx.fillStyle = '#f1f5f9';
        drawRoundedRect(ctx, -bW / 2, Math.round(8 * scale), bW, bH, Math.round(8 * scale));
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(10.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText('Nhập câu trả lời...', 0, Math.round(8 * scale) + bH / 2);

      } else if (s.type === 'countdown') {
        const cardW = Math.round(200 * scale);
        const cardH = Math.round(92 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = Math.round(12 * scale);
        ctx.shadowOffsetY = Math.round(5 * scale);
        const grad = ctx.createLinearGradient(-cardW / 2, -cardH / 2, cardW / 2, cardH / 2);
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(1, '#312e81');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.title || 'Sự kiện sắp diễn ra 🎉', 0, -cardH / 2 + Math.round(20 * scale));

        // Units
        const uW = Math.round(44 * scale);
        const uH = Math.round(38 * scale);
        const uY = Math.round(6 * scale);
        const vals = [s.days || '05', s.hours || '12', s.mins || '30'];
        const labels = ['NGÀY', 'GIỜ', 'PHÚT'];

        [-Math.round(56 * scale), 0, Math.round(56 * scale)].forEach((uX, idx) => {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          drawRoundedRect(ctx, uX - uW / 2, uY, uW, uH, Math.round(6 * scale));
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(14 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillText(vals[idx], uX, uY + Math.round(14 * scale));

          ctx.fillStyle = '#94a3b8';
          ctx.font = `600 ${Math.round(7.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillText(labels[idx], uX, uY + Math.round(28 * scale));
        });

      } else if (s.type === 'music_player') {
        const cardW = Math.round(210 * scale);
        const cardH = Math.round(48 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(24 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowColor = 'transparent';

        ctx.font = `${Math.round(16 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎵', -cardW / 2 + Math.round(20 * scale), 0);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.song || 'Trending Sound 🔥', -cardW / 2 + Math.round(38 * scale), -Math.round(6 * scale));

        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(9 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.artist || 'Instagram Audio', -cardW / 2 + Math.round(38 * scale), Math.round(8 * scale));

        ctx.font = `${Math.round(16 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('💿', cardW / 2 - Math.round(20 * scale), 0);

      } else if (s.type === 'emoji_slider') {
        const cardW = Math.round(190 * scale);
        const cardH = Math.round(68 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(12 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.question || 'Mức độ thích?', 0, -cardH / 2 + Math.round(18 * scale));

        // Track
        const trkW = Math.round(150 * scale);
        const trkH = Math.round(8 * scale);
        const grad = ctx.createLinearGradient(-trkW / 2, 0, trkW / 2, 0);
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(1, '#ec4899');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, -trkW / 2, Math.round(12 * scale), trkW, trkH, Math.round(4 * scale));
        ctx.fill();

        ctx.font = `${Math.round(20 * scale)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.fillText(s.emoji || '😍', 0, Math.round(15 * scale));

      } else if (s.type === 'add_yours') {
        const cardW = Math.round(195 * scale);
        const cardH = Math.round(62 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0284c7';
        ctx.font = `bold ${Math.round(10 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷 LƯỢT TIẾP THEO', 0, -cardH / 2 + Math.round(16 * scale));

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.prompt || 'Chia sẻ ảnh đẹp của bạn', 0, Math.round(10 * scale));
      }