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
  uint8: 255,
  uint16: 65535,
  uint32: 4294967295
};

const grow = (ta, amount) => {
  const newTa = new ta.constructor(new ArrayBuffer(ta.buffer.byteLength + amount * ta.BYTES_PER_ELEMENT));
  newTa.set(ta.buffer);
  return newTa;
};

const roundToMultiple4 = x => Math.ceil(x / 4) * 4;

const managers = {};
const $managerRef = Symbol('managerRef');
const $managerSize = Symbol('managerSize');
const $managerMaps = Symbol('maps');
const $managerSubarrays = Symbol('subarrays');
const $managerCursor = Symbol('managerCursor');
const $managerRemoved = Symbol('managerRemoved');
const $queryShadow = Symbol('queryShadow');
const $serializeShadow = Symbol('$serializeShadow');
const alloc = (schema, size = 1000000) => {
  const $manager = Symbol('manager');

  if (schema.constructor.name === 'Map') {
    schema[$managerSize] = size;
    return schema;
  }

  managers[$manager] = {
    [$managerSize]: size,
    [$managerMaps]: {},
    [$managerSubarrays]: {},
    [$managerRef]: $manager,
    [$managerCursor]: 0,
    [$managerRemoved]: []
  };
  const props = schema ? Object.keys(schema) : [];
  let arrays = props.filter(p => Array.isArray(schema[p]) && typeof schema[p][0] === 'object');
  const cursors = Object.keys(TYPES).reduce((a, type) => ({ ...a,
    [type]: 0
  }), {});

  if (typeof schema === 'string') {
    const type = schema;
    const totalBytes = size * TYPES[type].BYTES_PER_ELEMENT;
    const buffer = new ArrayBuffer(totalBytes);
    managers[$manager] = new TYPES[type](buffer);
  } else if (Array.isArray(schema)) {
    arrays = schema;
    const {
      type,
      length
    } = schema[0];
    const indexType = length < UNSIGNED_MAX.uint8 ? 'ui8' : length < UNSIGNED_MAX.uint16 ? 'ui16' : 'ui32';
    if (!length) throw new Error('❌ Must define a length for component array.');
    if (!TYPES[type]) throw new Error(`❌ Invalid component array property type ${type}.`); // create buffer for type if it does not already exist

    if (!managers[$manager][$managerSubarrays][type]) {
      const relevantArrays = arrays;
      const summedBytesPerElement = relevantArrays.reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0);
      const summedLength = relevantArrays.reduce((a, p) => a + length, 0);
      const buffer = new ArrayBuffer(roundToMultiple4(summedBytesPerElement * summedLength * size));
      const array = new TYPES[type](buffer);
      array._indexType = indexType;
      array._indexBytes = TYPES[indexType].BYTES_PER_ELEMENT;
      managers[$manager][$managerSubarrays][type] = array;
    } // pre-generate subarrays for each eid


    let end = 0;

    for (let eid = 0; eid < size; eid++) {
      const from = cursors[type] + eid * length;
      const to = from + length;
      managers[$manager][eid] = managers[$manager][$managerSubarrays][type].subarray(from, to);
      end = to;
    }

    cursors[type] = end;

    managers[$manager]._reset = eid => managers[$manager][eid].fill(0);

    managers[$manager]._set = (eid, values) => managers[$manager][eid].set(values, 0);
  } else props.forEach(prop => {
    // Boolean Type
    if (schema[prop] === 'bool') {
      const Type = TYPES.uint8;
      const totalBytes = size * TYPES.uint8.BYTES_PER_ELEMENT;
      const buffer = new ArrayBuffer(totalBytes);
      managers[$manager][$managerMaps][prop] = schema[prop];
      managers[$manager][prop] = new Type(buffer);
      managers[$manager][prop]._boolType = true; // Enum Type
    } else if (Array.isArray(schema[prop]) && typeof schema[prop][0] === 'string') {
      const Type = TYPES.uint8;
      const totalBytes = size * TYPES.uint8.BYTES_PER_ELEMENT;
      const buffer = new ArrayBuffer(totalBytes);
      managers[$manager][$managerMaps][prop] = schema[prop];
      managers[$manager][prop] = new Type(buffer); // Array Type
    } else if (Array.isArray(schema[prop]) && typeof schema[prop][0] === 'object') {
      const {
        type,
        length
      } = schema[0];
      if (!length) throw new Error('❌ Must define a length for component array.');
      if (!TYPES[type]) throw new Error(`❌ Invalid component array property type ${type}.`); // create buffer for type if it does not already exist

      if (!managers[$manager][$managerSubarrays][type]) {
        const relevantArrays = arrays.filter(p => schema[p][0].type === type);
        const summedBytesPerElement = relevantArrays.reduce((a, p) => a + TYPES[type].BYTES_PER_ELEMENT, 0);
        const summedLength = relevantArrays.reduce((a, p) => a + length, 0);
        const buffer = new ArrayBuffer(roundToMultiple4(summedBytesPerElement * summedLength * size));
        const array = new TYPES[type](buffer);
        array._indexType = index;
        array._indexBytes = TYPES[index].BYTES_PER_ELEMENT;
        managers[$manager][$managerSubarrays][type] = array;
      } // pre-generate subarrays for each eid


      managers[$manager][prop] = {};
      let end = 0;

      for (let eid = 0; eid < size; eid++) {
        const from = cursors[type] + eid * length;
        const to = from + length;
        managers[$manager][prop][eid] = managers[$manager][$managerSubarrays][type].subarray(from, to);
        end = to;
      }

      cursors[type] = end;

      managers[$manager][prop]._reset = eid => managers[$manager][prop][eid].fill(0);

      managers[$manager][prop]._set = (eid, values) => managers[$manager][prop][eid].set(values, 0); // Object Type

    } else if (typeof schema[prop] === 'object') {
      managers[$manager][prop] = Manager(size, schema[prop], false); // String Type
    } else if (typeof schema[prop] === 'string') {
      const type = schema[prop];
      const totalBytes = size * TYPES[type].BYTES_PER_ELEMENT;
      const buffer = new ArrayBuffer(totalBytes);
      const queryShadowBuffer = new ArrayBuffer(totalBytes);
      const serializeShadowBuffer = new ArrayBuffer(totalBytes);
      managers[$manager][prop] = new TYPES[type](buffer);
      managers[$manager][prop][$queryShadow] = new TYPES[type](queryShadowBuffer);
      managers[$manager][prop][$serializeShadow] = new TYPES[type](serializeShadowBuffer); // TypedArray Type
    } else if (typeof schema[prop] === 'function') {
      const Type = schema[prop];
      const totalBytes = size * Type.BYTES_PER_ELEMENT;
      const buffer = new ArrayBuffer(totalBytes);
      managers[$manager][prop] = new Type(buffer);
    } else {
      throw new Error(`ECS Error: invalid property type ${schema[prop]}`);
    }
  }); // methods


  Object.defineProperty(managers[$manager], '_schema', {
    value: schema
  });
  Object.defineProperty(managers[$manager], '_mapping', {
    value: prop => managers[$manager][$managerMaps][prop]
  }); // Recursively set all values to 0

  Object.defineProperty(managers[$manager], '_reset', {
    value: eid => {
      for (const prop of managers[$manager]._props) {
        if (ArrayBuffer.isView(managers[$manager][prop])) {
          if (ArrayBuffer.isView(managers[$manager][prop][eid])) {
            managers[$manager][prop][eid].fill(0);
          } else {
            managers[$manager][prop][eid] = 0;
          }
        } else {
          managers[$manager][prop]._reset(eid);
        }
      }
    }
  }); // Recursively set all values from a supplied object

  Object.defineProperty(managers[$manager], '_set', {
    value: (eid, values) => {
      for (const prop in values) {
        const mapping = managers[$manager]._mapping(prop);

        if (mapping && typeof values[prop] === 'string') {
          managers[$manager].enum(prop, eid, values[prop]);
        } else if (ArrayBuffer.isView(managers[$manager][prop])) {
          managers[$manager][prop][eid] = values[prop];
        } else if (Array.isArray(values[prop]) && ArrayBuffer.isView(managers[$manager][prop][eid])) {
          managers[$manager][prop][eid].set(values[prop], 0);
        } else if (typeof managers[$manager][prop] === 'object') {
          managers[$manager][prop]._set(eid, values[prop]);
        }
      }
    }
  });
  Object.defineProperty(managers[$manager], '_get', {
    value: eid => {
      const obj = {};

      for (const prop of managers[$manager]._props) {
        const mapping = managers[$manager]._mapping(prop);

        if (mapping) {
          obj[prop] = managers[$manager].enum(prop, eid);
        } else if (ArrayBuffer.isView(managers[$manager][prop])) {
          obj[prop] = managers[$manager][prop][eid];
        } else if (typeof managers[$manager][prop] === 'object') {
          if (ArrayBuffer.isView(managers[$manager][prop][eid])) {
            obj[prop] = Array.from(managers[$manager][prop][eid]);
          } else {
            obj[prop] = managers[$manager][prop]._get(eid);
          }
        }
      }

      return obj;
    }
  });
  Object.defineProperty(managers[$manager], '_props', {
    value: props
  }); // Aggregate all typedArrays into single kvp array (memoized)

  let flattened;
  Object.defineProperty(managers[$manager], '_flatten', {
    value: (flat = []) => {
      if (flattened) return flattened;

      for (const prop of managers[$manager]._props) {
        if (ArrayBuffer.isView(managers[$manager][prop])) {
          flat.push(managers[$manager][prop]);
        } else if (typeof managers[$manager][prop] === 'object') {
          managers[$manager][prop]._flatten(flat);
        }
      }

      flattened = flat;
      return flat;
    }
  });
  Object.defineProperty(managers[$manager], 'enum', {
    value: (prop, eid, value) => {
      const mapping = managers[$manager]._mapping(prop);

      if (!mapping) {
        console.warn('Property is not an enum.');
        return undefined;
      }

      if (value) {
        const index = mapping.indexOf(value);

        if (index === -1) {
          console.warn(`Value '${value}' is not part of enum.`);
          return undefined;
        }

        managers[$manager][prop][eid] = index;
      } else {
        return mapping[managers[$manager][prop][eid]];
      }
    }
  });
  Object.defineProperty(managers[$manager], '_grow', {
    value: amount => {
      managers[$manager][$managerSize] += amount;

      for (const prop of managers[$manager]._props) {
        if (ArrayBuffer.isView(managers[$manager][prop])) {
          managers[$manager][prop] = grow(managers[$manager][prop], amount);
          managers[$manager][prop][$queryShadow] = grow(managers[$manager][prop], amount);
        } else if (typeof managers[$manager][prop] === 'object') {
          if (ArrayBuffer.isView(managers[$manager][prop][eid])) ; else {
            managers[$manager][prop]._grow();
          }
        }
      }
    }
  });
  return managers[$manager];
};

const $entityMasks = Symbol('entityMasks');
const $entityEnabled = Symbol('entityEnabled');
const $deferredEntityRemovals = Symbol('deferredEntityRemovals');
const $removedEntities = Symbol('removedEntities'); // need a global EID cursor which all worlds and all components know about
// so that world entities can posess entire rows spanning all component tables

let globalEntityCursor = 0;
const getEntityCursor = () => globalEntityCursor;
const addEntity = world => {
  const removed = world[$removedEntities];
  const size = world[$size];
  const enabled = world[$entityEnabled];

  if (globalEntityCursor >= size - size / 5) {
    // if 80% full
    const amount = Math.ceil(size / 2 / 4) * 4; // grow by half the original size rounded up to a multiple of 4
    // grow data stores

    world[$componentMap].forEach(component => {
      component.manager._grow(amount);
    });
    world[$size] += amount; // TODO: grow metadata on world mappings for world's internal queries/components
  }

  const eid = removed.length > 0 ? removed.pop() : globalEntityCursor;
  enabled[eid] = 1;
  globalEntityCursor++;
  return eid;
};
const removeEntity = (world, eid) => world[$deferredEntityRemovals].push(eid);
const commitEntityRemovals = world => {
  const deferred = world[$deferredEntityRemovals];
  const queries = world[$queries];
  const removed = world[$removedEntities];
  const enabled = world[$entityEnabled];

  for (let i = 0; i < deferred.length; i++) {
    const eid = deferred[i]; // Check if entity is already removed

    if (enabled[eid] === 0) continue; // Remove entity from all queries
    // TODO: archetype graph

    queries.forEach(query => {
      queryRemoveEntity(world, query, eid);
    }); // Free the entity

    removed.push(eid);
    enabled[eid] = 0; // Clear component bitmasks

    for (let i = 0; i < world[$entityMasks].length; i++) world[$entityMasks][i][eid] = 0;
  }

  deferred.length = 0;
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
  let componentProps;
  let changedProps = new Set();

  if (Array.isArray(target)) {
    componentProps = target.map(p => {
      if (p._flatten) {
        return p._flatten();
      } else if (typeof p === 'function' && p.name === 'QueryChanged') {
        p = p();

        if (p._flatten) {
          let props = p._flatten();

          props.forEach(x => changedProps.add(x));
          return props;
        }

        changedProps.add(p);
        return [p];
      }
    }).reduce((a, v) => a.concat(v), []);
  } else {
    target[$componentMap].forEach(c => {
      componentProps = componentProps.concat(c._flatten());
    });
  }

  return [componentProps, changedProps];
};

const defineSerializer = (target, maxBytes = 5000000) => {
  const buffer = new ArrayBuffer(maxBytes);
  const view = new DataView(buffer);
  const [componentProps, changedProps] = canonicalize(target);
  return ents => {
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

        prop[$serializeShadow][eid] = prop[eid];
        count++; // write eid

        view.setUint32(where, eid);
        where += 4; // if property is an array

        if (ArrayBuffer.isView(prop[eid])) {
          const type = prop[eid].constructor.name.replace('Array', '');
          const indexType = prop[eid]._indexType;
          const indexBytes = prop[eid]._indexBytes; // add space for count of dirty array elements

          const countWhere2 = where;
          where += 1;
          let count2 = 0; // write array values

          for (let i = 0; i < prop[eid].length; i++) {
            const val = prop[eid][i]; // write array index

            view[`set${indexType}`](where, i);
            where += indexBytes; // write value at that index

            view[`set${type}`](where, val);
            where += prop[eid].BYTES_PER_ELEMENT;
            count2++;
          }

          view[`set${indexType}`](countWhere2, count2);
        } else {
          // regular property values
          const type = prop.constructor.name.replace('Array', ''); // set value next [type] bytes

          view[`set${type}`](where, prop[eid]);
          where += prop.BYTES_PER_ELEMENT;
        }
      }

      view.setUint32(countWhere, count);
    }

    return buffer.slice(0, where);
  };
};
const defineDeserializer = target => {
  const [componentProps] = canonicalize(target);
  return packet => {
    const view = new DataView(packet);
    let where = 0; // pid

    const pid = view.getUint8(where);
    where += 1; // entity count

    const entityCount = view.getUint32(where);
    where += 4; // typed array

    const ta = componentProps[pid]; // Get the properties and set the new state

    for (let i = 0; i < entityCount; i++) {
      const eid = view.getUint32(where);
      where += 4;

      if (ArrayBuffer.isView(ta[eid])) {
        const array = ta[eid];
        const count = view[`get${array._indexType}`];
        where += array._indexBytes; // iterate over count

        for (let i = 0; i < count; i++) {
          const value = view[`get${array.constructor.name.replace('Array', '')}`](where);
          where += array.BYTES_PER_ELEMENT;
          ta[eid][i] = value;
        }
      } else {
        let value = view[`get${ta.constructor.name.replace('Array', '')}`](where);
        where += ta.BYTES_PER_ELEMENT;
        ta[eid] = value;
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
const $queryComponents = Symbol('queryComponents');
const enterQuery = (world, query, fn) => {
  if (!world[$queryMap].get(query)) registerQuery(world, query);
  world[$queryMap].get(query).enter = fn;
};
const exitQuery = (world, query, fn) => {
  if (!world[$queryMap].get(query)) registerQuery(world, query);
  world[$queryMap].get(query).exit = fn;
};
const registerQuery = (world, query) => {
  if (!world[$queryMap].get(query)) world[$queryMap].set(query, {});
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

  const size = components.reduce((a, c) => c[$managerSize] > a ? c[$managerSize] : a, 0);
  const entities = [];
  const changed = [];
  const indices = new Uint32Array(size);
  const enabled = new Uint8Array(size);
  const generations = components.concat(notComponents).map(mapComponents).map(c => c.generationId).reduce((a, v) => {
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
  const notMasks = components.map(mapComponents).reduce((a, c) => {
    if (!a[c.generationId] && notComponents.includes(c)) a[c.generationId] = 0;
    a[c.generationId] |= c.bitflag;
    return a;
  }, {});
  const flatProps = components.map(c => c._flatten ? c._flatten() : [c]).reduce((a, v) => a.concat(v), []);
  Object.assign(world[$queryMap].get(query), {
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
    flatProps
  });
  world[$queries].add(query);

  for (let eid = 0; eid < getEntityCursor(); eid++) {
    if (!world[$entityEnabled][eid]) continue;

    if (queryCheckEntity(world, query, eid)) {
      queryAddEntity(world, query, eid);
    }
  }
};
const defineQuery = components => {
  const query = function (world) {
    if (!world[$queryMap].has(query)) registerQuery(world, query);
    const q = world[$queryMap].get(query);
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
    const eMask = world[$entityMasks][generationId][eid]; // if (qNotMask && !(eMask & qNotMask)) {
    //   return false
    // }

    if ((eMask & qMask) !== qMask) {
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

const queryCheckComponents = (world, query, components) => {
  return components.every(c => queryCheckComponent(world, query, c));
};
const queryAddEntity = (world, query, eid) => {
  const q = world[$queryMap].get(query);
  if (q.enabled[eid]) return;
  q.enabled[eid] = true;
  q.entities.push(eid);
  q.indices[eid] = q.entities.length - 1;
  if (q.enter) q.enter(eid);
};
const queryRemoveEntity = (world, query, eid) => {
  const q = world[$queryMap].get(query);
  if (!q.enabled[eid]) return;
  q.enabled[eid] = false;
  q.entities.splice(q.indices[eid]);
  if (q.exit) q.exit(eid);
};

const $componentMap = Symbol('componentMap');
const $deferredComponentRemovals = Symbol('de$deferredComponentRemovals');
const defineComponent = schema => alloc(schema);
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
    manager: component
  });
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
  if (hasComponent(world, component, eid)) return; // Add bitflag to entity bitmask

  const {
    generationId,
    bitflag
  } = world[$componentMap].get(component);
  world[$entityMasks][generationId][eid] |= bitflag; // Zero out each property value
  // component._reset(eid)
  // todo: archetype graph

  const queries = world[$queries];
  queries.forEach(query => {
    const components = query[$queryComponents];
    if (!queryCheckComponents(world, query, components)) return;
    const match = queryCheckEntity(world, query, eid);
    if (match) queryAddEntity(world, query, eid);
  });
};
const removeComponent = (world, component, eid) => world[$deferredComponentRemovals].push(component, eid);
const commitComponentRemovals = world => {
  const deferredComponentRemovals = world[$deferredComponentRemovals];

  for (let i = 0; i < deferredComponentRemovals.length; i += 2) {
    const component = deferredComponentRemovals[i];
    const eid = deferredComponentRemovals[i + 1];
    const {
      generationId,
      bitflag
    } = world[$componentMap].get(component);
    if (!(world[$entityMasks][generationId][eid] & bitflag)) return; // Remove flag from entity bitmask

    world[$entityMasks][generationId][eid] &= ~bitflag; // todo: archetype graph

    const queries = world[$queries];
    queries.forEach(query => {
      const components = query[$queryComponents];
      if (!queryCheckComponents(world, query, components)) return;
      const match = queryCheckEntity(world, query, eid);
      if (match) queryRemoveEntity(world, query, eid);
    });
  }

  deferredComponentRemovals.length = 0;
};

const $size = Symbol('size');
const $bitflag = Symbol('bitflag');
const createWorld = (size = 1000000) => {
  const world = {};
  world[$size] = size;
  world[$entityEnabled] = new Uint8Array(size);
  world[$entityMasks] = [new Uint32Array(size)];
  world[$removedEntities] = [];
  world[$bitflag] = 1;
  world[$componentMap] = new Map();
  world[$queryMap] = new Map();
  world[$queries] = new Set();
  world[$deferredComponentRemovals] = [];
  world[$deferredEntityRemovals] = [];
  return world;
};

const defineSystem = update => {
  const system = world => {
    update(world);
    commitComponentRemovals(world);
    commitEntityRemovals(world);
  };

  Object.defineProperty(system, 'name', {
    value: (update.name || "AnonymousSystem") + "_internal",
    configurable: true
  });
  return system;
};

const pipe = fns => world => {
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    fn(world);
  }
};
const Types = TYPES_ENUM;

export { Changed, Not, Types, addComponent, addEntity, createWorld, defineComponent, defineDeserializer, defineQuery, defineSerializer, defineSystem, enterQuery, exitQuery, hasComponent, pipe, registerComponent, registerComponents, removeComponent, removeEntity };
//# sourceMappingURL=index.es.js.map
