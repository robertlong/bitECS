const TYPES_ENUM = {
  bool: 'bool',
  i8: 'i8',
  ui8: 'ui8',
  ui8c: 'ui8c',
  i16: 'i16',
  ui16: 'ui16',
  i32: 'i32',
  ui32: 'ui32',
  f32: 'f32',
  f64: 'f64'
};
const TYPES_NAMES = {
  bool: 'Uint8',
  i8: 'Int8',
  ui8: 'Uint8',
  ui8c: 'Uint8Clamped',
  i16: 'Int16',
  ui16: 'Uint16',
  i32: 'Int32',
  ui32: 'Uint32',
  f32: 'Float32',
  f64: 'Float64'
};
const TYPES = {
  bool: 'bool',
  i8: Int8Array,
  ui8: Uint8Array,
  ui8c: Uint8ClampedArray,
  i16: Int16Array,
  ui16: Uint16Array,
  i32: Int32Array,
  ui32: Uint32Array,
  f32: Float32Array,
  f64: Float64Array
};
const UNSIGNED_MAX = {
  uint8: 2 ** 8,
  uint16: 2 ** 16,
  uint32: 2 ** 32
};

const roundToMultiple4 = x => Math.ceil(x / 4) * 4;

const $storeRef = Symbol('storeRef');
const $storeSize = Symbol('storeSize');
const $storeMaps = Symbol('storeMaps');
const $storeFlattened = Symbol('storeFlattened');
const $storeBase = Symbol('storeBase');
const $storeArrayCount = Symbol('storeArrayCount');
const $storeSubarrays = Symbol('storeSubarrays');
const $storeCursor = Symbol('storeCursor');
const $subarrayCursors = Symbol('subarrayCursors');
const $subarray = Symbol('subarray');
const $queryShadow = Symbol('queryShadow');
const $serializeShadow = Symbol('serializeShadow');
const $indexType = Symbol('indexType');
const $indexBytes = Symbol('indexBytes');
const stores = {};
const resize = (ta, size) => {
  const newBuffer = new ArrayBuffer(size * ta.BYTES_PER_ELEMENT);
  const newTa = new ta.constructor(newBuffer);
  newTa.set(ta, 0);
  return newTa;
};

const resizeRecursive = (store, size) => {
  Object.keys(store).forEach(key => {
    const ta = store[key];
    if (ta[$subarray]) return;else if (ArrayBuffer.isView(ta)) {
      store[key] = resize(ta, size);
      store[key][$queryShadow] = resize(ta[$queryShadow], size);
      store[key][$serializeShadow] = resize(ta[$serializeShadow], size);
    } else if (typeof ta === 'object') {
      resizeRecursive(store[key], size);
    }
  });
};

const resizeSubarrays = (store, size) => {
  const cursors = store[$subarrayCursors] = {};
  Object.keys(store[$storeSubarrays]).forEach(type => {
    const arrayCount = store[$storeArrayCount];
    const length = store[0].length;
    const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0);
    const summedLength = Array(arrayCount).fill(0).reduce((a, p) => a + length, 0);
    const buffer = new ArrayBuffer(roundToMultiple4(summedBytesPerElement * summedLength * size));
    const array = new TYPES[type](buffer);
    array.set(store[$storeSubarrays][type].buffer, 0);
    store[$storeSubarrays][type] = array;
    store[$storeSubarrays][type][$queryShadow] = array.slice(0);
    store[$storeSubarrays][type][$serializeShadow] = array.slice(0);

    for (let eid = 0; eid < size; eid++) {
      const from = cursors[type] + eid * length;
      const to = from + length;
      store[eid] = store[$storeSubarrays][type].subarray(from, to);
      store[eid][$queryShadow] = store[$storeSubarrays][type][$queryShadow].subarray(from, to);
      store[eid][$serializeShadow] = store[$storeSubarrays][type][$serializeShadow].subarray(from, to);
      store[eid][$subarray] = true;
      store[eid][$indexType] = array[$indexType];
      store[eid][$indexBytes] = array[$indexBytes];
    }
  });
};

const resizeStore = (store, size) => {
  store[$storeSize] = size;
  resizeRecursive(store, size);
  resizeSubarrays(store, size);
};
const resetStoreFor = (store, eid) => {
  store[$storeFlattened].forEach(ta => {
    if (ArrayBuffer.isView(ta)) ta[eid] = 0;else ta[eid].fill(0);
  });
};

const createTypeStore = (type, length) => {
  const totalBytes = length * TYPES[type].BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(totalBytes);
  return new TYPES[type](buffer);
};

const createArrayStore = (store, type, length) => {
  const size = store[$storeSize];
  const cursors = store[$subarrayCursors];
  const indexType = length < UNSIGNED_MAX.uint8 ? 'ui8' : length < UNSIGNED_MAX.uint16 ? 'ui16' : 'ui32';
  if (!length) throw new Error('❌ Must define a length for component array.');
  if (!TYPES[type]) throw new Error(`❌ Invalid component array property type ${type}.`); // create buffer for type if it does not already exist

  if (!store[$storeSubarrays][type]) {
    const arrayCount = store[$storeArrayCount];
    const summedBytesPerElement = Array(arrayCount).fill(0).reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0);
    const summedLength = Array(arrayCount).fill(0).reduce((a, p) => a + length, 0);
    const totalBytes = roundToMultiple4(summedBytesPerElement * summedLength * size);
    const buffer = new ArrayBuffer(totalBytes);
    const array = new TYPES[type](buffer);
    store[$storeSubarrays][type] = array;
    store[$storeSubarrays][type][$queryShadow] = array.slice(0);
    store[$storeSubarrays][type][$serializeShadow] = array.slice(0);
    array[$indexType] = TYPES_NAMES[indexType];
    array[$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT;
  } // pre-generate subarrays for each eid


  let end = 0;

  for (let eid = 0; eid < size; eid++) {
    const from = cursors[type] + eid * length;
    const to = from + length;
    store[eid] = store[$storeSubarrays][type].subarray(from, to);
    store[eid][$queryShadow] = store[$storeSubarrays][type][$queryShadow].subarray(from, to);
    store[eid][$serializeShadow] = store[$storeSubarrays][type][$serializeShadow].subarray(from, to);
    store[eid][$subarray] = true;
    store[eid][$indexType] = TYPES_NAMES[indexType];
    store[eid][$indexBytes] = TYPES[indexType].BYTES_PER_ELEMENT;
    end = to;
  }

  cursors[type] = end;
  return store;
};

const createShadows = store => {
  store[$queryShadow] = store.slice(0);
  store[$serializeShadow] = store.slice(0);
};

const isArrayType = x => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'number';

const createStore = (schema, size = 1000000) => {
  const $store = Symbol('store');
  if (!schema) return {};
  schema = JSON.parse(JSON.stringify(schema));

  const collectArrayCount = (count, key) => {
    if (isArrayType(schema[key])) {
      count++;
    } else if (schema[key] instanceof Object) {
      count += Object.keys(schema[key]).reduce(collectArrayCount, 0);
    }

    return count;
  };

  const arrayCount = Object.keys(schema).reduce(collectArrayCount, 0);
  const metadata = {
    [$storeSize]: size,
    [$storeMaps]: {},
    [$storeSubarrays]: {},
    [$storeRef]: $store,
    [$storeCursor]: 0,
    [$subarrayCursors]: Object.keys(TYPES).reduce((a, type) => ({ ...a,
      [type]: 0
    }), {}),
    [$storeArrayCount]: arrayCount,
    [$storeFlattened]: []
  };

  if (schema instanceof Object && Object.keys(schema).length) {
    const recursiveTransform = (a, k) => {
      if (typeof a[k] === 'string') {
        a[k] = createTypeStore(a[k], size);

        a[k][$storeBase] = () => stores[$store];

        metadata[$storeFlattened].push(a[k]);
        createShadows(a[k]);
      } else if (isArrayType(a[k])) {
        const [type, length] = a[k];
        a[k] = createArrayStore(metadata, type, length);

        a[k][$storeBase] = () => stores[$store];

        metadata[$storeFlattened].push(a[k]); // Object.freeze(a[k])
      } else if (a[k] instanceof Object) {
        a[k] = Object.keys(a[k]).reduce(recursiveTransform, a[k]); // Object.freeze(a[k])
      }

      return a;
    };

    stores[$store] = Object.assign(Object.keys(schema).reduce(recursiveTransform, schema), metadata);

    stores[$store][$storeBase] = () => stores[$store]; // Object.freeze(stores[$store])


    return stores[$store];
  }

  stores[$store] = metadata;

  stores[$store][$storeBase] = () => stores[$store];

  return stores[$store];
};

const $entityMasks = Symbol('entityMasks');
const $entityEnabled = Symbol('entityEnabled');
const $entityArray = Symbol('entityArray');
const $entityIndices = Symbol('entityIndices');
const NONE = 2 ** 32; // need a global EID cursor which all worlds and all components know about
// so that world entities can posess entire rows spanning all component tables

let globalEntityCursor = 0; // removed eids should also be global to prevent memory leaks

const removed = [];
const getEntityCursor = () => globalEntityCursor;
const resizeWorld = (world, size) => {
  world[$size] = size;
  world[$componentMap].forEach(c => {
    resizeStore(c.store, size);
  });
  world[$queryMap].forEach(q => {
    q.indices = resize(q.indices, size);
    q.enabled = resize(q.enabled, size);
  });
  world[$entityEnabled] = resize(world[$entityEnabled], size);
  world[$entityIndices] = resize(world[$entityIndices], size);

  for (let i = 0; i < world[$entityMasks].length; i++) {
    const masks = world[$entityMasks][i];
    world[$entityMasks][i] = resize(masks, size);
  }
};
const addEntity = world => {
  const enabled = world[$entityEnabled]; // if data stores are 80% full

  if (globalEntityCursor >= world[$warningSize]) {
    // grow by half the original size rounded up to a multiple of 4
    const size = world[$size];
    const amount = Math.ceil(size / 2 / 4) * 4;
    resizeWorld(world, size + amount);
    world[$warningSize] = world[$size] - world[$size] / 5;
  }

  const eid = removed.length > 0 ? removed.pop() : globalEntityCursor;
  enabled[eid] = 1;
  globalEntityCursor++;
  world[$entityIndices][eid] = world[$entityArray].push(eid) - 1;
  return eid;
};
const removeEntity = (world, eid) => {
  const enabled = world[$entityEnabled]; // Check if entity is already removed

  if (enabled[eid] === 0) return; // Remove entity from all queries
  // TODO: archetype graph

  world[$queries].forEach(query => {
    queryRemoveEntity(world, query, eid);
  }); // Free the entity

  removed.push(eid);
  enabled[eid] = 0; // pop swap

  const index = world[$entityIndices][eid];
  const swapped = world[$entityArray].pop();

  if (swapped !== eid) {
    world[$entityArray][index] = swapped;
    world[$entityIndices][swapped] = index;
  }

  world[$entityIndices][eid] = NONE; // Clear entity bitmasks

  for (let i = 0; i < world[$entityMasks].length; i++) world[$entityMasks][i][eid] = 0;
};

const diff = (world, query) => {
  const q = world[$queryMap].get(query);
  q.changed.length = 0;
  const flat = q.flatProps;

  for (let i = 0; i < q.entities.length; i++) {
    const eid = q.entities[i];
    let dirty = false;

    for (let pid = 0; pid < flat.length; pid++) {
      const prop = flat[pid];

      if (ArrayBuffer.isView(prop[eid])) {
        for (let i = 0; i < prop[eid].length; i++) {
          if (prop[eid][i] !== prop[eid][$queryShadow][i]) {
            dirty = true;
            prop[eid][$queryShadow][i] = prop[eid][i];
          }
        }
      } else {
        if (prop[eid] !== prop[$queryShadow][eid]) {
          dirty = true;
          prop[$queryShadow][eid] = prop[eid];
        }
      }
    }

    if (dirty) q.changed.push(eid);
  }

  return q.changed;
};

const canonicalize = target => {
  let componentProps = [];
  let changedProps = new Set();

  if (Array.isArray(target)) {
    componentProps = target.map(p => {
      if (typeof p === 'function' && p.name === 'QueryChanged') {
        p()[$storeFlattened].forEach(prop => {
          changedProps.add(prop);
        });
        return p()[$storeFlattened];
      }

      if (Object.getOwnPropertySymbols(p).includes($storeFlattened)) {
        return p[$storeFlattened];
      }

      if (Object.getOwnPropertySymbols(p).includes($storeBase)) {
        return p;
      }
    }).reduce((a, v) => a.concat(v), []);
  }

  return [componentProps, changedProps];
};

const defineSerializer = (target, maxBytes = 20_000_000) => {
  const isWorld = Object.getOwnPropertySymbols(target).includes($componentMap);
  let [componentProps, changedProps] = canonicalize(target); // TODO: calculate max bytes based on target

  const buffer = new ArrayBuffer(maxBytes);
  const view = new DataView(buffer);
  return ents => {
    if (isWorld) {
      componentProps = [];
      target[$componentMap].forEach((c, component) => {
        componentProps.push(...component[$storeFlattened]);
      });
    }

    if (Object.getOwnPropertySymbols(ents).includes($componentMap)) {
      ents = ents[$entityArray];
    }

    if (!ents.length) return;
    let where = 0; // iterate over component props

    for (let pid = 0; pid < componentProps.length; pid++) {
      const prop = componentProps[pid];
      const diff = changedProps.has(prop); // write pid

      view.setUint8(where, pid);
      where += 1; // save space for entity count

      const countWhere = where;
      where += 4;
      let count = 0; // write eid,val

      for (let i = 0; i < ents.length; i++) {
        const eid = ents[i]; // skip if diffing and no change

        if (diff && prop[eid] === prop[$serializeShadow][eid]) {
          continue;
        }

        count++; // write eid

        view.setUint32(where, eid);
        where += 4; // if property is an array

        if (ArrayBuffer.isView(prop[eid])) {
          const type = prop[eid].constructor.name.replace('Array', '');
          const indexType = prop[eid][$indexType];
          const indexBytes = prop[eid][$indexBytes]; // add space for count of dirty array elements

          const countWhere2 = where;
          where += 1;
          let count2 = 0; // write index,value

          for (let i = 0; i < prop[eid].length; i++) {
            const value = prop[eid][i];

            if (diff && prop[eid][i] === prop[eid][$serializeShadow][i]) {
              continue;
            } // write array index


            view[`set${indexType}`](where, i);
            where += indexBytes; // write value at that index

            view[`set${type}`](where, value);
            where += prop[eid].BYTES_PER_ELEMENT;
            count2++;
          } // write total element count


          view[`set${indexType}`](countWhere2, count2);
        } else {
          // regular property values
          const type = prop.constructor.name.replace('Array', ''); // set value next [type] bytes

          view[`set${type}`](where, prop[eid]);
          where += prop.BYTES_PER_ELEMENT; // sync shadow state

          prop[$serializeShadow][eid] = prop[eid];
        }
      }

      view.setUint32(countWhere, count);
    }

    return buffer.slice(0, where);
  };
};
const defineDeserializer = target => {
  const isWorld = Object.getOwnPropertySymbols(target).includes($componentMap);
  let [componentProps] = canonicalize(target);
  return (world, packet) => {
    if (isWorld) {
      componentProps = [];
      target[$componentMap].forEach((c, component) => {
        componentProps.push(...component[$storeFlattened]);
      });
    }

    const view = new DataView(packet);
    let where = 0;

    while (where < packet.byteLength) {
      // pid
      const pid = view.getUint8(where);
      where += 1; // entity count

      const entityCount = view.getUint32(where);
      where += 4; // typed array

      const ta = componentProps[pid]; // Get the properties and set the new state

      for (let i = 0; i < entityCount; i++) {
        let eid = view.getUint32(where);
        where += 4; // if this world hasn't seen this eid yet

        if (!world[$entityEnabled][eid]) {
          // make a new entity for the data
          eid = addEntity(world);
        }

        const component = ta[$storeBase]();

        if (!hasComponent(world, component, eid)) {
          addComponent(world, component, eid);
        }

        if (ArrayBuffer.isView(ta[eid])) {
          const array = ta[eid];
          const count = view[`get${array[$indexType]}`](where);
          where += array[$indexBytes]; // iterate over count

          for (let i = 0; i < count; i++) {
            const index = view[`get${array[$indexType]}`](where);
            where += array[$indexBytes];
            const value = view[`get${array.constructor.name.replace('Array', '')}`](where);
            where += array.BYTES_PER_ELEMENT;
            ta[eid][index] = value;
          }
        } else {
          let value = view[`get${ta.constructor.name.replace('Array', '')}`](where);
          where += ta.BYTES_PER_ELEMENT;
          ta[eid] = value;
        }
      }
    }
  };
};

function Not(c) {
  return function QueryNot() {
    return c;
  };
}
function Changed(c) {
  return function QueryChanged() {
    return c;
  };
}
const $queries = Symbol('queries');
const $queryMap = Symbol('queryMap');
const $dirtyQueries = Symbol('$dirtyQueries');
const $queryComponents = Symbol('queryComponents');
const NONE$1 = 2 ** 32; // TODO: linked list of functions

const enterQuery = (world, query, fn) => {
  if (!world[$queryMap].has(query)) registerQuery(world, query);
  world[$queryMap].get(query).enter = fn;
};
const exitQuery = (world, query, fn) => {
  if (!world[$queryMap].has(query)) registerQuery(world, query);
  world[$queryMap].get(query).exit = fn;
};
const registerQuery = (world, query) => {
  let components = [];
  let notComponents = [];
  let changedComponents = [];
  query[$queryComponents].forEach(c => {
    if (typeof c === 'function') {
      if (c.name === 'QueryNot') {
        notComponents.push(c());
      }

      if (c.name === 'QueryChanged') {
        changedComponents.push(c());
        components.push(c());
      }
    } else {
      components.push(c);
    }
  });

  const mapComponents = c => world[$componentMap].get(c);

  const size = components.concat(notComponents).reduce((a, c) => c[$storeSize] > a ? c[$storeSize] : a, 0);
  const entities = [];
  const changed = [];
  const indices = new Uint32Array(size).fill(NONE$1);
  const enabled = new Uint8Array(size);
  const generations = components.concat(notComponents).map(c => {
    if (!world[$componentMap].has(c)) registerComponent(world, c);
    return c;
  }).map(mapComponents).map(c => c.generationId).reduce((a, v) => {
    if (a.includes(v)) return a;
    a.push(v);
    return a;
  }, []);

  const reduceBitmasks = (a, c) => {
    if (!a[c.generationId]) a[c.generationId] = 0;
    a[c.generationId] |= c.bitflag;
    return a;
  };

  const masks = components.map(mapComponents).reduce(reduceBitmasks, {});
  const notMasks = notComponents.map(mapComponents).reduce((a, c) => {
    if (!a[c.generationId]) {
      a[c.generationId] = 0;
      a[c.generationId] |= c.bitflag;
    }

    return a;
  }, {});
  const flatProps = components.map(c => Object.getOwnPropertySymbols(c).includes($storeFlattened) ? c[$storeFlattened] : [c]).reduce((a, v) => a.concat(v), []);
  const toRemove = [];
  const entered = [];
  const exited = [];
  world[$queryMap].set(query, {
    entities,
    changed,
    enabled,
    components,
    notComponents,
    changedComponents,
    masks,
    notMasks,
    generations,
    indices,
    flatProps,
    toRemove,
    entered,
    exited
  });
  world[$queries].add(query);

  for (let eid = 0; eid < getEntityCursor(); eid++) {
    if (!world[$entityEnabled][eid]) continue;

    if (queryCheckEntity(world, query, eid)) {
      queryAddEntity(world, query, eid);
    }
  }
};

const queryHooks = q => {
  while (q.entered.length) if (q.enter) {
    q.enter(q.entered.shift());
  } else q.entered.shift();

  while (q.exited.length) if (q.exit) {
    q.exit(q.exited.shift());
  } else q.exited.shift();
};

const defineQuery = components => {
  const query = function (world) {
    if (!world[$queryMap].has(query)) registerQuery(world, query);
    const q = world[$queryMap].get(query);
    queryHooks(q);
    queryCommitRemovals(world, q);
    if (q.changedComponents.length) return diff(world, query);
    return q.entities;
  };

  query[$queryComponents] = components;
  return query;
}; // TODO: archetype graph

const queryCheckEntity = (world, query, eid) => {
  const {
    masks,
    notMasks,
    generations
  } = world[$queryMap].get(query);

  for (let i = 0; i < generations.length; i++) {
    const generationId = generations[i];
    const qMask = masks[generationId];
    const qNotMask = notMasks[generationId];
    const eMask = world[$entityMasks][generationId][eid];

    if (qNotMask && (eMask & qNotMask) !== 0) {
      return false;
    }

    if (qMask && (eMask & qMask) !== qMask) {
      return false;
    }
  }

  return true;
};
const queryCheckComponent = (world, query, component) => {
  const {
    generationId,
    bitflag
  } = world[$componentMap].get(component);
  const {
    masks
  } = world[$queryMap].get(query);
  const mask = masks[generationId];
  return (mask & bitflag) === bitflag;
};
const queryAddEntity = (world, query, eid) => {
  const q = world[$queryMap].get(query);
  if (q.enabled[eid]) return;
  q.enabled[eid] = true;
  q.entities.push(eid);
  q.indices[eid] = q.entities.length - 1;
  q.entered.push(eid);
};

const queryCommitRemovals = (world, q) => {
  while (q.toRemove.length) {
    const eid = q.toRemove.pop();
    const index = q.indices[eid];
    if (index === NONE$1) continue;
    const swapped = q.entities.pop();

    if (swapped !== eid) {
      q.entities[index] = swapped;
      q.indices[swapped] = index;
    }

    q.indices[eid] = NONE$1;
  }

  world[$dirtyQueries].delete(q);
};

const commitRemovals = world => {
  world[$dirtyQueries].forEach(q => {
    queryCommitRemovals(world, q);
  });
};
const queryRemoveEntity = (world, query, eid) => {
  const q = world[$queryMap].get(query);
  if (!q.enabled[eid]) return;
  q.enabled[eid] = false;
  q.toRemove.push(eid);
  world[$dirtyQueries].add(q);
  q.exited.push(eid);
};

const $componentMap = Symbol('componentMap');
const defineComponent = schema => createStore(schema);
const incrementBitflag = world => {
  world[$bitflag] *= 2;

  if (world[$bitflag] >= 2 ** 32) {
    world[$bitflag] = 1;
    world[$entityMasks].push(new Uint32Array(world[$size]));
  }
};
const registerComponent = (world, component) => {
  world[$componentMap].set(component, {
    generationId: world[$entityMasks].length - 1,
    bitflag: world[$bitflag],
    store: component
  });

  if (component[$storeSize] < world[$size]) {
    resizeStore(component, world[$size]);
  }

  incrementBitflag(world);
};
const registerComponents = (world, components) => {
  components.forEach(c => registerComponent(world, c));
};
const hasComponent = (world, component, eid) => {
  const {
    generationId,
    bitflag
  } = world[$componentMap].get(component);
  const mask = world[$entityMasks][generationId][eid];
  return (mask & bitflag) === bitflag;
};
const addComponent = (world, component, eid) => {
  if (!world[$componentMap].has(component)) registerComponent(world, component);
  if (hasComponent(world, component, eid)) return; // Add bitflag to entity bitmask

  const {
    generationId,
    bitflag
  } = world[$componentMap].get(component);
  world[$entityMasks][generationId][eid] |= bitflag; // Zero out each property value

  resetStoreFor(component, eid); // todo: archetype graph

  world[$queries].forEach(query => {
    if (!queryCheckComponent(world, query, component)) return;
    const match = queryCheckEntity(world, query, eid);
    if (match) queryAddEntity(world, query, eid);
  });
};
const removeComponent = (world, component, eid) => {
  const {
    generationId,
    bitflag
  } = world[$componentMap].get(component);
  if (!(world[$entityMasks][generationId][eid] & bitflag)) return; // todo: archetype graph

  world[$queries].forEach(query => {
    if (!queryCheckComponent(world, query, component)) return;
    const match = queryCheckEntity(world, query, eid);
    if (match) queryRemoveEntity(world, query, eid);
  }); // Remove flag from entity bitmask

  world[$entityMasks][generationId][eid] &= ~bitflag;
};

const $size = Symbol('size');
const $warningSize = Symbol('warningSize');
const $bitflag = Symbol('bitflag');
const createWorld = (size = 1000000) => {
  const world = {};
  world[$size] = size;
  world[$entityEnabled] = new Uint8Array(size);
  world[$entityMasks] = [new Uint32Array(size)];
  world[$entityArray] = [];
  world[$entityIndices] = new Uint32Array(size);
  world[$bitflag] = 1;
  world[$componentMap] = new Map();
  world[$queryMap] = new Map();
  world[$queries] = new Set();
  world[$dirtyQueries] = new Set();
  world[$warningSize] = size - size / 5;
  return world;
};

const defineSystem = update => {
  const system = world => {
    update(world);
    commitRemovals(world);
    return world;
  };

  Object.defineProperty(system, 'name', {
    value: (update.name || "AnonymousSystem") + "_internal",
    configurable: true
  });
  return system;
};

const pipe = (...fns) => input => {
  fns = Array.isArray(fns[0]) ? fns[0] : fns;
  let tmp = input;

  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    tmp = fn(tmp);
  }
};
const Types = TYPES_ENUM;

export { Changed, Not, Types, addComponent, addEntity, commitRemovals, createWorld, defineComponent, defineDeserializer, defineQuery, defineSerializer, defineSystem, enterQuery, exitQuery, hasComponent, pipe, registerComponent, registerComponents, removeComponent, removeEntity };
//# sourceMappingURL=index.es.js.map
