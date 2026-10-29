// 연동 모드: 키오스크 ↔ 폰을 잇는 메모리 저장소 (롱폴링)
export class KioskHub {
  constructor() { this.k = new Map(); }
  _get(id) {
    if (!this.k.has(id)) this.k.set(id, { state: null, sv: 0, profile: null, pv: 0, waiters: [], pwaiters: [], at: Date.now() });
    return this.k.get(id);
  }
  getState(id) {
    const x = this.k.get(id);
    if (!x?.state || Date.now() - x.at > 10 * 60 * 1000) return null; // 10분 지나면 무효
    return { screen: x.state, version: x.sv };
  }
  setState(id, screen) {
    const x = this._get(id);
    x.state = screen; x.sv++; x.at = Date.now();
    const w = x.waiters.splice(0); w.forEach((f) => f());
    return { ok: true, version: x.sv };
  }
  async waitState(id, since, waitSec) {
    const x = this._get(id);
    if (x.sv <= since && waitSec > 0) await this._wait(x.waiters, Math.min(waitSec, 25) * 1000);
    return { screen: x.state, version: x.sv };
  }
  setProfile(id, profile) {
    const x = this._get(id);
    x.profile = profile || null; x.pv++;
    const w = x.pwaiters.splice(0); w.forEach((f) => f());
    return { ok: true, version: x.pv };
  }
  async waitProfile(id, since, waitSec) {
    const x = this._get(id);
    if (x.pv <= since && waitSec > 0) await this._wait(x.pwaiters, Math.min(waitSec, 25) * 1000);
    return { profile: x.profile, version: x.pv };
  }
  reset(id) { const x = this._get(id); x.profile = null; x.pv++; x.pwaiters.splice(0).forEach((f) => f()); return { ok: true }; }
  _wait(list, ms) {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); const i = list.indexOf(done); if (i >= 0) list.splice(i, 1); resolve(); }
      list.push(done);
    });
  }
}
