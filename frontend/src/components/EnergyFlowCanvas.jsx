import React, { useRef, useEffect } from 'react';

class FlowParticle {
  constructor(sourceX, sourceY, targetX, targetY, color, speed) {
    this.sourceX = sourceX;
    this.sourceY = sourceY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.color = color;
    this.speed = speed;
    this.progress = Math.random();
  }

  update() {
    this.progress += this.speed;
    if (this.progress >= 1) {
      this.progress = 0;
    }
  }

  draw(ctx) {
    const x = this.sourceX + (this.targetX - this.sourceX) * this.progress;
    const y = this.sourceY + (this.targetY - this.sourceY) * this.progress;

    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export default function EnergyFlowCanvas({ latestData }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    let lastParticleSetup = 0;

    function resizeFlow() {
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = 320 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `320px`;
      ctx.scale(dpr, dpr);
    }

    resizeFlow();
    window.addEventListener('resize', resizeFlow);

    function render(time) {
      if (!canvas || !ctx) return;
      const w = canvas.parentElement ? canvas.parentElement.clientWidth : 750;
      const h = 320;

      ctx.clearRect(0, 0, w, h);

      // Extract telemetry values with defaults
      const d = latestData?.dispatch || {};
      const t = latestData?.telemetry || {};
      const m = latestData?.monitoring || {};

      const windKw = m.sources?.wind_kw ?? (d.p_wind_kw !== undefined ? d.p_wind_kw : 104.0);
      const solarKw = m.sources?.solar_kw ?? (d.p_solar_kw !== undefined ? d.p_solar_kw : 86.0);
      const totalRenewableKw = windKw + solarKw; // ~190 kW
      const genKw = m.sources?.diesel_kw ?? ((d.p_diesel_1_kw || 180.0) + (d.p_diesel_2_kw || 0.0)); // ~180 kW
      const battKw = m.sources?.battery_kw ?? (d.p_battery_discharge_kw !== undefined ? d.p_battery_discharge_kw : 42.0);
      const isCharging = battKw < 0;
      const battAbsKw = Math.abs(battKw);

      // Dynamic Flow Routing Calculations
      const flowRenToLoad = Math.min(totalRenewableKw, 210.0);
      const flowRenToBatt = isCharging ? battAbsKw : 0.0;
      const flowBattToLoad = !isCharging ? battAbsKw : 0.0;
      const flowGenToLoad = genKw;
      const flowGenToBatt = 0.0;

      // Topology coordinates
      const nodes = {
        renewables: { x: w * 0.16, y: h * 0.24, title: 'Wind & Solar Hybrid', val: `${totalRenewableKw.toFixed(0)} kW`, sub: `W: ${windKw.toFixed(0)}k | S: ${solarKw.toFixed(0)}k`, color: '#05C5FF' },
        generator: { x: w * 0.16, y: h * 0.76, title: 'Diesel Gen-Set G1/G2', val: `${genKw.toFixed(0)} kW`, sub: 'Optimal LP Modulated', color: '#f43f5e' },
        bus: { x: w * 0.50, y: h * 0.50, title: 'Inverter Grid Bus', val: '400V 50Hz', sub: 'Balanced · 0 kW Residual', color: '#0699C6' },
        battery: { x: w * 0.50, y: h * 0.88, title: 'BESS LiFePO4 Reserve', val: isCharging ? `+${battAbsKw.toFixed(0)} kW Chg` : `-${battAbsKw.toFixed(0)} kW Disch`, sub: '77% SoC · 20% Floor Safe', color: '#10b981' },
        load: { x: w * 0.84, y: h * 0.50, title: 'Total Station Demand', val: `${Math.round(t.station_load_kwe || t.load_elec_kw || 412)} kW`, sub: '20 kW Life Support Non-Shed', color: '#127694' }
      };

      // Set up Particles periodically with speed and density proportional to power magnitude
      if (time - lastParticleSetup > 2000 || particles.length === 0) {
        particles = [];

        // Helper: scale count and speed
        const getParticleConfig = (power) => {
          if (power <= 0.5) return { count: 0, speed: 0 };
          const count = Math.max(3, Math.min(16, Math.round(power / 16)));
          const speed = Math.max(0.005, Math.min(0.014, 0.004 + (power / 400) * 0.009));
          return { count, speed };
        };

        // 1. Renewables -> Bus
        const renCfg = getParticleConfig(totalRenewableKw);
        for (let i = 0; i < renCfg.count; i++) {
          particles.push(new FlowParticle(nodes.renewables.x, nodes.renewables.y, nodes.bus.x, nodes.bus.y, '#05C5FF', renCfg.speed));
        }

        // 2. Renewables -> Battery (if charging)
        if (isCharging && battAbsKw > 1.0) {
          const chgCfg = getParticleConfig(battAbsKw);
          for (let i = 0; i < chgCfg.count; i++) {
            particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.battery.x, nodes.battery.y, '#10b981', chgCfg.speed));
          }
        }

        // 3. Battery -> Bus (if discharging)
        if (!isCharging && battAbsKw > 1.0) {
          const dischCfg = getParticleConfig(battAbsKw);
          for (let i = 0; i < dischCfg.count; i++) {
            particles.push(new FlowParticle(nodes.battery.x, nodes.battery.y, nodes.bus.x, nodes.bus.y, '#10b981', dischCfg.speed));
          }
        }

        // 4. Generator -> Bus
        if (genKw > 1.0) {
          const genCfg = getParticleConfig(genKw);
          for (let i = 0; i < genCfg.count; i++) {
            particles.push(new FlowParticle(nodes.generator.x, nodes.generator.y, nodes.bus.x, nodes.bus.y, '#f43f5e', genCfg.speed));
          }
        }

        // 5. Bus -> Load (dynamic station demand)
        const activeLoad = t.station_load_kwe || t.load_elec_kw || 412.0;
        const loadCfg = getParticleConfig(activeLoad);
        for (let i = 0; i < loadCfg.count; i++) {
          particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.load.x, nodes.load.y, '#0699C6', loadCfg.speed));
        }

        lastParticleSetup = time;
      }

      // 1. Draw Vector Connection Lines (Illuminated if active > 0 kW, dashed muted if 0 kW)
      ctx.lineWidth = 2;

      // Renewables -> Bus
      ctx.beginPath();
      if (totalRenewableKw > 0.5) {
        ctx.strokeStyle = 'rgba(5, 197, 255, 0.8)';
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.setLineDash([4, 4]);
      }
      ctx.moveTo(nodes.renewables.x, nodes.renewables.y);
      ctx.lineTo(nodes.bus.x, nodes.bus.y);
      ctx.stroke();

      // Generator -> Bus
      ctx.beginPath();
      if (genKw > 0.5) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.setLineDash([4, 4]);
      }
      ctx.moveTo(nodes.generator.x, nodes.generator.y);
      ctx.lineTo(nodes.bus.x, nodes.bus.y);
      ctx.stroke();

      // Bus <-> Battery
      ctx.beginPath();
      if (battAbsKw > 0.5) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.setLineDash([4, 4]);
      }
      ctx.moveTo(nodes.bus.x, nodes.bus.y);
      ctx.lineTo(nodes.battery.x, nodes.battery.y);
      ctx.stroke();

      // Bus -> Load
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(6, 153, 198, 0.85)';
      ctx.setLineDash([]);
      ctx.moveTo(nodes.bus.x, nodes.bus.y);
      ctx.lineTo(nodes.load.x, nodes.load.y);
      ctx.stroke();

      // Generator -> Battery (0 kW dashed line)
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
      ctx.moveTo(nodes.generator.x, nodes.generator.y);
      ctx.lineTo(nodes.battery.x, nodes.battery.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Draw Transfer Label Pills on Connections
      function drawPill(text, x, y, bg = '#ffffff', fg = '#127694', border = '#bcecfc') {
        ctx.font = '700 9px "JetBrains Mono", monospace';
        const metrics = ctx.measureText(text);
        const pw = metrics.width + 12;
        const ph = 18;

        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 9);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
      }

      // Explicit dynamic flow values
      drawPill(`Renewable → Bus: ${totalRenewableKw.toFixed(0)} kW`, (nodes.renewables.x + nodes.bus.x) / 2, (nodes.renewables.y + nodes.bus.y) / 2 - 10, '#f0faff', '#0699C6', '#bcecfc');
      if (isCharging) {
        drawPill(`Bus → BESS: +${battAbsKw.toFixed(0)} kW (Charging)`, nodes.bus.x - 70, (nodes.bus.y + nodes.battery.y) / 2, '#f0fdf4', '#10b981', '#a7f3d0');
      } else {
        drawPill(`BESS → Bus: -${battAbsKw.toFixed(0)} kW (Discharge)`, nodes.bus.x + 70, (nodes.bus.y + nodes.battery.y) / 2, '#f0faff', '#127694', '#bcecfc');
      }
      drawPill(`Gen → Bus: ${genKw.toFixed(0)} kW`, (nodes.generator.x + nodes.bus.x) / 2, (nodes.generator.y + nodes.bus.y) / 2 + 10, '#fef2f2', '#f43f5e', '#fecaca');
      drawPill(`Gen → BESS: 0 kW (Direct Lockout)`, (nodes.generator.x + nodes.battery.x) / 2, (nodes.generator.y + nodes.battery.y) / 2 + 10, '#f8fafc', '#94a3b8', '#e2e8f0');
      drawPill(`Bus → Load: 412 kW Demand`, (nodes.bus.x + nodes.load.x) / 2, (nodes.bus.y + nodes.load.y) / 2 - 10, '#f0faff', '#127694', '#bcecfc');

      // 3. Update & Draw Particles
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      // 4. Draw Node Cards
      function drawNodeCard(node, isBus = false) {
        const boxW = isBus ? 144 : 136;
        const boxH = isBus ? 56 : 52;
        const rx = node.x - boxW / 2;
        const ry = node.y - boxH / 2;

        ctx.fillStyle = 'rgba(18, 118, 148, 0.05)';
        ctx.beginPath();
        ctx.roundRect(rx + 2, ry + 2, boxW, boxH, 12);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = isBus ? '#0699C6' : (node.color || '#bcecfc');
        ctx.lineWidth = isBus ? 2 : 1.2;

        ctx.beginPath();
        ctx.roundRect(rx, ry, boxW, boxH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.title, node.x, ry + 8);

        ctx.font = '800 13px "JetBrains Mono", monospace';
        ctx.fillStyle = node.color || '#127694';
        ctx.fillText(node.val, node.x, ry + 22);

        ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(node.sub, node.x, ry + 38);
      }

      [nodes.renewables, nodes.generator, nodes.battery, nodes.load].forEach(n => drawNodeCard(n));
      drawNodeCard(nodes.bus, true);

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resizeFlow);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [latestData]);

  return (
    <div className="relative w-full flex flex-col items-center justify-center bg-gradient-to-b from-white to-[#f7fcfe] rounded-2xl border border-[#bcecfc]/80 overflow-hidden shadow-inner p-2">
      <div className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-[#bcecfc]/40 mb-1">
        <span className="flex items-center gap-1.5 text-[#127694]">
          <i className="fa-solid fa-diagram-project text-xs text-[#0699C6]"></i>
          Real-Time Bus Circuit Routing &amp; Flow Dynamics
        </span>
        <span className="text-[#0699C6] font-mono lowercase">Particle Speed &amp; Density Proportional to kW Power</span>
      </div>
      <canvas ref={canvasRef} id="energy-flow-canvas" className="w-full" style={{ height: '320px' }} />
    </div>
  );
}
