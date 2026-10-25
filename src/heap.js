// Heap binário mínimo de ids numéricos, usado pelo A* e pelo campo de fluxo.
export class MinHeap {
  constructor() {
    this.ids = [];
    this.keys = [];
  }

  get size() {
    return this.ids.length;
  }

  clear() {
    this.ids.length = 0;
    this.keys.length = 0;
  }

  push(id, key) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop() {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    this.lastKey = keys[0];
    const id = ids.pop(), key = keys.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= key) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = id;
      keys[i] = key;
    }
    return top;
  }
}
