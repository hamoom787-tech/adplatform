'use strict';

class TtlCache {
  constructor(defaultTtlMs = 300000, maxItems = 200) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxItems = maxItems;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.map.size >= this.maxItems) {
      const firstKey = this.map.keys().next().value;
      if (firstKey) this.map.delete(firstKey);
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key) {
    this.map.delete(key);
  }

  clearExpired() {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
  }
}

module.exports = { TtlCache };
