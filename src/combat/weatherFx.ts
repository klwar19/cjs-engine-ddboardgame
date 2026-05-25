// Weather particle overlay — paints rain/snow/sand/acid/sun particles on a
// DOM layer. Kept imperative because each weather change rebuilds dozens
// of <span> particles with random properties; React would not buy us
// anything here. Public API: applyWeather(host, weatherId | null).

function rand(min: number, max: number): string {
  return (Math.random() * (max - min) + min).toFixed(2);
}

function buildParticles(weatherId: string): string {
  switch (weatherId) {
    case "rain": {
      const drops = [];
      for (let i = 0; i < 60; i++) {
        const left = rand(0, 100);
        const delay = rand(0, 0.7);
        const dur = rand(0.55, 0.95);
        const op = rand(0.55, 1);
        drops.push(
          `<span class="cjs-rain-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`
        );
      }
      return drops.join("");
    }
    case "blizzard": {
      const flakes = [];
      const glyphs = ["❄", "❅", "❆", "*"];
      for (let i = 0; i < 40; i++) {
        const left = rand(0, 100);
        const delay = rand(0, 5);
        const dur = rand(4, 7);
        const size = rand(8, 18);
        const op = rand(0.6, 1);
        const g = glyphs[i % glyphs.length];
        flakes.push(
          `<span class="cjs-snow-flake" style="left:${left}%;font-size:${size}px;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}">${g}</span>`
        );
      }
      return flakes.join("");
    }
    case "sandstorm": {
      const streaks = [];
      for (let i = 0; i < 30; i++) {
        const top = rand(0, 100);
        const delay = rand(0, 1.4);
        const dur = rand(1.0, 1.8);
        const w = rand(60, 160);
        const op = rand(0.5, 0.95);
        streaks.push(
          `<span class="cjs-sand-streak" style="top:${top}%;width:${w}px;animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`
        );
      }
      return streaks.join("");
    }
    case "acid_rain": {
      const drops = [];
      for (let i = 0; i < 35; i++) {
        const left = rand(0, 100);
        const delay = rand(0, 1.1);
        const dur = rand(0.9, 1.4);
        drops.push(
          `<span class="cjs-acid-drop" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s"></span><span class="cjs-acid-splash" style="left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s"></span>`
        );
      }
      return drops.join("");
    }
    case "sunny": {
      const rays = [];
      for (let i = 0; i < 16; i++) {
        const left = rand(0, 100);
        const rot = rand(-8, 8);
        const delay = rand(0, 3);
        const dur = rand(2.4, 4.2);
        const op = rand(0.3, 0.7);
        rays.push(
          `<span class="cjs-sun-ray" style="left:${left}%;transform:rotate(${rot}deg);animation-delay:-${delay}s;animation-duration:${dur}s;opacity:${op}"></span>`
        );
      }
      rays.push(`<span class="cjs-sun-shimmer"></span>`);
      return rays.join("");
    }
    default:
      return "";
  }
}

export class WeatherFx {
  private hostEl: HTMLElement | null = null;
  private currentId: string | null = null;

  attach(host: HTMLElement): void {
    this.hostEl = host;
    this.currentId = null;
  }

  detach(): void {
    if (this.hostEl) {
      this.hostEl.classList.remove("is-active");
      this.hostEl.innerHTML = "";
      this.hostEl.removeAttribute("data-weather");
    }
    this.hostEl = null;
    this.currentId = null;
  }

  apply(weatherId: string | null): void {
    if (!this.hostEl) return;
    if (this.currentId === weatherId) return;
    this.currentId = weatherId;
    if (!weatherId) {
      this.hostEl.classList.remove("is-active");
      this.hostEl.innerHTML = "";
      this.hostEl.removeAttribute("data-weather");
      return;
    }
    this.hostEl.setAttribute("data-weather", weatherId);
    this.hostEl.classList.add("is-active");
    this.hostEl.innerHTML = `<div class="cjs-weather-wash"></div><div class="cjs-weather-particles">${buildParticles(weatherId)}</div>`;
  }
}
