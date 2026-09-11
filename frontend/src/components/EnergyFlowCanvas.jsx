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
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
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
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = 300;
    }

    resizeFlow();
    window.addEventListener('resize', resizeFlow);

    function render(time) {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Dynamic Topology Coordinates
      const nodes = {
        wind: { x: w * 0.14, y: h * 0.22, title: 'Wind Turbines', kw: 44.88, color: '#05c5ff' },
        solar: { x: w * 0.14, y: h * 0.50, title: 'Solar PV', kw: 1.34, color: '#f59e0b' },
        diesel: { x: w * 0.14, y: h * 0.78, title: 'Diesel Gen-Set', kw: 0.0, color: '#f43f5e' },
        bus: { x: w * 0.48, y: h * 0.48, title: 'Inverter Grid Bus', color: '#0698c4' },
        bat: { x: w * 0.48, y: h * 0.82, title: 'Storage Bank (BESS)', kw: 0.0, color: '#10b981' },
        heating: { x: w * 0.84, y: h * 0.28, title: 'Life Support HVAC', kw: 26.4, color: '#0284c7' },
        lab: { x: w * 0.84, y: h * 0.55, title: 'Science Labs', kw: 11.5, color: '#0ea5e9' },
        lighting: { x: w * 0.84, y: h * 0.80, title: 'Perimeter Lighting', kw: 2.5, color: '#38bdf8' }
      };

      if (latestData) {
        const d = latestData.dispatch || {};
        const t = latestData.telemetry || {};
        nodes.wind.kw = d.p_wind_kw !== undefined ? d.p_wind_kw : (t.wind_speed_ms > 3 ? 44.88 : 0);
        nodes.solar.kw = d.p_solar_kw !== undefined ? d.p_solar_kw : (t.solar_irradiance_wm2 > 10 ? 1.34 : 0);
        nodes.diesel.kw = (d.p_diesel_1_kw || 0) + (d.p_diesel_2_kw || 0);
        nodes.bat.kw = d.p_battery_kw !== undefined ? d.p_battery_kw : ((d.p_battery_discharge_kw || 0) - (d.p_battery_charge_kw || 0));
        nodes.heating.kw = t.load_thermal_kw ? t.load_thermal_kw * 0.45 : 26.4;
        nodes.lab.kw = t.load_elec_kw ? t.load_elec_kw * 0.35 : 11.5;
        nodes.lighting.kw = 2.5;
      }

      // Refresh Particles every 1.5s or on init
      if (time - lastParticleSetup > 1500 || particles.length === 0) {
        particles = [];
        if (nodes.wind.kw > 0.1) {
          for (let i = 0; i < 12; i++) {
            particles.push(new FlowParticle(nodes.wind.x, nodes.wind.y, nodes.bus.x, nodes.bus.y, '#05c5ff', 0.008));
          }
        }
        if (nodes.solar.kw > 0.1) {
          for (let i = 0; i < 8; i++) {
            particles.push(new FlowParticle(nodes.solar.x, nodes.solar.y, nodes.bus.x, nodes.bus.y, '#f59e0b', 0.008));
          }
        }
        if (nodes.diesel.kw > 0.1) {
          for (let i = 0; i < 10; i++) {
            particles.push(new FlowParticle(nodes.diesel.x, nodes.diesel.y, nodes.bus.x, nodes.bus.y, '#f43f5e', 0.009));
          }
        }
        if (nodes.bat.kw > 0.1) {
          for (let i = 0; i < 8; i++) {
            particles.push(new FlowParticle(nodes.bat.x, nodes.bat.y, nodes.bus.x, nodes.bus.y, '#10b981', 0.008));
          }
        } else if (nodes.bat.kw < -0.1) {
          for (let i = 0; i < 8; i++) {
            particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.bat.x, nodes.bat.y, '#05c5ff', 0.008));
          }
        }
        for (let i = 0; i < 10; i++) {
          particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.heating.x, nodes.heating.y, '#0284c7', 0.009));
        }
        for (let i = 0; i < 6; i++) {
          particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.lab.x, nodes.lab.y, '#0ea5e9', 0.007));
        }
        for (let i = 0; i < 4; i++) {
          particles.push(new FlowParticle(nodes.bus.x, nodes.bus.y, nodes.lighting.x, nodes.lighting.y, '#38bdf8', 0.006));
        }
        lastParticleSetup = time;
      }

      // Draw Vector Connection Lines
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(154, 229, 254, 0.55)';

      [nodes.wind, nodes.solar, nodes.diesel].forEach(n => {
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(nodes.bus.x, nodes.bus.y);
        ctx.stroke();
      });

      ctx.beginPath();
      ctx.moveTo(nodes.bus.x, nodes.bus.y);
      ctx.lineTo(nodes.bat.x, nodes.bat.y);
      ctx.stroke();

      [nodes.heating, nodes.lab, nodes.lighting].forEach(n => {
        ctx.beginPath();
        ctx.moveTo(nodes.bus.x, nodes.bus.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      });

      // Update & Draw Particles
      particles.forEach(p => {
        p.update();
        p.draw(ctx);
      });

      // Draw Node Boxes
      function drawNodeCard(node, isBus = false) {
        const boxW = isBus ? 130 : 120;
        const boxH = isBus ? 50 : 44;
        const rx = node.x - boxW / 2;
        const ry = node.y - boxH / 2;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = isBus ? '#0698c4' : 'rgba(154, 229, 254, 0.9)';
        ctx.lineWidth = isBus ? 2 : 1.2;

        ctx.beginPath();
        ctx.roundRect(rx, ry, boxW, boxH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#127694';
        ctx.textAlign = 'center';
        ctx.fillText(node.title, node.x, ry + 16);

        if (node.kw !== undefined) {
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.fillStyle = node.color || '#0698c4';
          ctx.fillText(node.kw.toFixed(2) + ' kW', node.x, ry + 32);
        } else if (isBus) {
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle = '#05c5ff';
          ctx.fillText('Synced 400V 50Hz', node.x, ry + 32);
        }
      }

      [nodes.wind, nodes.solar, nodes.diesel, nodes.bat, nodes.heating, nodes.lab, nodes.lighting].forEach(n => drawNodeCard(n));
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
    <div className="relative w-full flex items-center justify-center my-2.5 bg-white rounded-xl border border-slate-100 overflow-hidden shadow-inner min-h-[300px]">
      <canvas ref={canvasRef} id="energy-flow-canvas" className="w-full h-[300px]" />
    </div>
  );
}
