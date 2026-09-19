'use strict'

const nbt = require('prismarine-nbt')
const UUID = require('uuid-1345')
const zlib = require('zlib')
const [readVarInt, writeVarInt, sizeOfVarInt] = require('protodef').types.varint
const [readLpVec3, writeLpVec3, sizeOfLpVec3] = require('./lpVec3')

module.exports = {
  varlong: [readVarLong, writeVarLong, sizeOfVarLong],
  UUID: [readUUID, writeUUID, 16],
  compressedNbt: [readCompressedNbt, writeCompressedNbt, sizeOfCompressedNbt],
  restBuffer: [readRestBuffer, writeRestBuffer, sizeOfRestBuffer],
  entityDelta: [readEntityDelta, writeEntityDelta, sizeOfEntityDelta],
  entityMetadataLoop: [readEntityMetadata, writeEntityMetadata, sizeOfEntityMetadata],
  topBitSetTerminatedArray: [readTopBitSetTerminatedArray, writeTopBitSetTerminatedArray, sizeOfTopBitSetTerminatedArray],
  lpVec3: [readLpVec3, writeLpVec3, sizeOfLpVec3]
}
const PartialReadError = require('protodef').utils.PartialReadError

function readVarLong (buffer, offset) {
  return readVarInt(buffer, offset)
}

function writeVarLong (value, buffer, offset) {
  return writeVarInt(value, buffer, offset)
}

function sizeOfVarLong (value) {
  return sizeOfVarInt(value)
}

function readUUID (buffer, offset) {
  if (offset + 16 > buffer.length) { throw new PartialReadError() }
  return {
    value: UUID.stringify(buffer.slice(offset, 16 + offset)),
    size: 16
  }
}

function writeUUID (value, buffer, offset) {
  const buf = value.length === 32 ? Buffer.from(value, 'hex') : UUID.parse(value)
  buf.copy(buffer, offset)
  return offset + 16
}

function sizeOfNbt (value, { tagType } = { tagType: 'nbt' }) {
  return nbt.proto.sizeOf(value, tagType)
}

// Length-prefixed compressed NBT, see differences: http://wiki.vg/index.php?title=Slot_Data&diff=6056&oldid=4753
function readCompressedNbt (buffer, offset) {
  if (offset + 2 > buffer.length) { throw new PartialReadError() }
  const length = buffer.readInt16BE(offset)
  if (length === -1) return { size: 2 }
  if (offset + 2 + length > buffer.length) { throw new PartialReadError() }

  const compressedNbt = buffer.slice(offset + 2, offset + 2 + length)

  let nbtBuffer
  try {
    nbtBuffer = zlib.gunzipSync(compressedNbt) // TODO: async
  } catch (err) {
    throw new PartialReadError('zlib decompress failed: ' + err.message)
  }

  const results = nbt.proto.read(nbtBuffer, 0, 'nbt')
  return {
    size: length + 2,
    value: results.value
  }
}

function writeCompressedNbt (value, buffer, offset) {
  if (value === undefined) {
    buffer.writeInt16BE(-1, offset)
    return offset + 2
  }
  const nbtBuffer = Buffer.alloc(sizeOfNbt(value))
  nbt.proto.write(value, nbtBuffer, 0, 'nbt')

  const compressedNbt = zlib.gzipSync(nbtBuffer) // TODO: async
  compressedNbt.writeUInt8(0, 9) // clear the OS field to match MC

  buffer.writeInt16BE(compressedNbt.length, offset)
  compressedNbt.copy(buffer, offset + 2)
  return offset + 2 + compressedNbt.length
}

function sizeOfCompressedNbt (value) {
  if (value === undefined) { return 2 }

  const nbtBuffer = Buffer.alloc(sizeOfNbt(value, { tagType: 'nbt' }))
  nbt.proto.write(value, nbtBuffer, 0, 'nbt')

  const compressedNbt = zlib.gzipSync(nbtBuffer) // TODO: async

  return 2 + compressedNbt.length
}

function readRestBuffer (buffer, offset) {
  return {
    value: buffer.slice(offset),
    size: buffer.length - offset
  }
}

function writeRestBuffer (value, buffer, offset) {
  value.copy(buffer, offset)
  return offset + value.length
}

function sizeOfRestBuffer (value) {
  return value.length
}

// Minecraft 26.3 encodes relative entity movement as a packed property word
// followed by either one legacy fixed point delta or a chain of delta steps.
// Bit 0 of the property word is onGround; the remaining bits are the number
// of stepped deltas.  The protocol data names this wire type entityDelta.
function readEntityDelta (buffer, offset) {
  const properties = readVarInt(buffer, offset)
  if (properties.value < 0) throw new Error(`invalid negative entityDelta properties ${properties.value}`)
  const onGround = (properties.value & 1) !== 0
  const stepCount = properties.value >>> 1
  let cursor = offset + properties.size
  const steps = []

  if (stepCount === 0) {
    if (cursor + 6 > buffer.length) throw new PartialReadError()
    steps.push({
      dX: buffer.readInt16BE(cursor),
      dY: buffer.readInt16BE(cursor + 2),
      dZ: buffer.readInt16BE(cursor + 4)
    })
    cursor += 6
  } else {
    // A stepped entry occupies at least one VarInt byte plus three shorts.
    // Reject an impossible count once enough bytes are present to distinguish
    // a malformed frame from a genuinely partial read.
    const available = buffer.length - cursor
    if (available >= 7 && stepCount > Math.floor(available / 7)) {
      throw new Error(`entityDelta step count ${stepCount} exceeds available payload`)
    }
    for (let i = 0; i < stepCount; i++) {
      const ticks = readVarInt(buffer, cursor)
      cursor += ticks.size
      if (cursor + 6 > buffer.length) throw new PartialReadError()
      steps.push({
        ticks: ticks.value,
        dX: buffer.readInt16BE(cursor),
        dY: buffer.readInt16BE(cursor + 2),
        dZ: buffer.readInt16BE(cursor + 4)
      })
      cursor += 6
    }
  }

  return { value: { onGround, steps }, size: cursor - offset }
}

function getEntityDeltaSteps (value) {
  if (Array.isArray(value?.steps)) {
    if (value.steps.length === 0) throw new RangeError('entityDelta requires at least one movement step')
    return value.steps
  }
  if (value && Number.isInteger(value.dX) && Number.isInteger(value.dY) && Number.isInteger(value.dZ)) {
    return [{ dX: value.dX, dY: value.dY, dZ: value.dZ }]
  }
  throw new TypeError('entityDelta requires a steps array or dX/dY/dZ fields')
}

function validateEntityDeltaCoordinate (value, name) {
  if (!Number.isInteger(value) || value < -32768 || value > 32767) {
    throw new RangeError(`entityDelta ${name} must be a signed 16-bit integer`)
  }
}

function writeEntityDelta (value, buffer, offset) {
  const steps = getEntityDeltaSteps(value)
  const stepCount = steps.length === 1 && steps[0].ticks == null ? 0 : steps.length
  if (stepCount > 0x3fffffff) throw new RangeError('entityDelta has too many movement steps')
  const properties = (stepCount * 2) + (value?.onGround ? 1 : 0)
  let cursor = writeVarInt(properties, buffer, offset)

  if (stepCount === 0) {
    const step = steps[0]
    validateEntityDeltaCoordinate(step.dX, 'dX')
    validateEntityDeltaCoordinate(step.dY, 'dY')
    validateEntityDeltaCoordinate(step.dZ, 'dZ')
    buffer.writeInt16BE(step.dX, cursor)
    buffer.writeInt16BE(step.dY, cursor + 2)
    buffer.writeInt16BE(step.dZ, cursor + 4)
    return cursor + 6
  }

  for (const step of steps) {
    if (!Number.isSafeInteger(step.ticks) || step.ticks < 0) throw new RangeError('entityDelta ticks must be a non-negative safe integer')
    validateEntityDeltaCoordinate(step.dX, 'dX')
    validateEntityDeltaCoordinate(step.dY, 'dY')
    validateEntityDeltaCoordinate(step.dZ, 'dZ')
    cursor = writeVarInt(step.ticks, buffer, cursor)
    buffer.writeInt16BE(step.dX, cursor)
    buffer.writeInt16BE(step.dY, cursor + 2)
    buffer.writeInt16BE(step.dZ, cursor + 4)
    cursor += 6
  }
  return cursor
}

function sizeOfEntityDelta (value) {
  const steps = getEntityDeltaSteps(value)
  const stepCount = steps.length === 1 && steps[0].ticks == null ? 0 : steps.length
  if (stepCount > 0x3fffffff) throw new RangeError('entityDelta has too many movement steps')
  let size = sizeOfVarInt((stepCount * 2) + (value?.onGround ? 1 : 0))
  for (const step of steps) {
    validateEntityDeltaCoordinate(step.dX, 'dX')
    validateEntityDeltaCoordinate(step.dY, 'dY')
    validateEntityDeltaCoordinate(step.dZ, 'dZ')
    if (stepCount > 0) {
      if (!Number.isSafeInteger(step.ticks) || step.ticks < 0) throw new RangeError('entityDelta ticks must be a non-negative safe integer')
      size += sizeOfVarInt(step.ticks)
    }
    size += 6
    if (stepCount === 0) break
  }
  return size
}

function readEntityMetadata (buffer, offset, { type, endVal }) {
  let cursor = offset
  const metadata = []
  let item
  while (true) {
    if (offset + 1 > buffer.length) { throw new PartialReadError() }
    item = buffer.readUInt8(cursor)
    if (item === endVal) {
      return {
        value: metadata,
        size: cursor + 1 - offset
      }
    }
    const results = this.read(buffer, cursor, type, {})
    metadata.push(results.value)
    cursor += results.size
  }
}

function writeEntityMetadata (value, buffer, offset, { type, endVal }) {
  const self = this
  value.forEach(function (item) {
    offset = self.write(item, buffer, offset, type, {})
  })
  buffer.writeUInt8(endVal, offset)
  return offset + 1
}

function sizeOfEntityMetadata (value, { type }) {
  let size = 1
  for (let i = 0; i < value.length; ++i) {
    size += this.sizeOf(value[i], type, {})
  }
  return size
}

function readTopBitSetTerminatedArray (buffer, offset, { type }) {
  let cursor = offset
  const values = []
  let item
  while (true) {
    if (offset + 1 > buffer.length) { throw new PartialReadError() }
    item = buffer.readUInt8(cursor)
    buffer[cursor] = buffer[cursor] & 127 // removes top bit
    const results = this.read(buffer, cursor, type, {})
    values.push(results.value)
    cursor += results.size
    if ((item & 128) === 0) { // check if top bit is set, if not last value
      return {
        value: values,
        size: cursor - offset
      }
    }
  }
}

function writeTopBitSetTerminatedArray (value, buffer, offset, { type }) {
  const self = this
  let prevOffset = offset
  value.forEach(function (item, i) {
    prevOffset = offset
    offset = self.write(item, buffer, offset, type, {})
    buffer[prevOffset] = i !== value.length - 1 ? (buffer[prevOffset] | 128) : buffer[prevOffset] // set top bit for all values but last
  })
  return offset
}

function sizeOfTopBitSetTerminatedArray (value, { type }) {
  let size = 0
  for (let i = 0; i < value.length; ++i) {
    size += this.sizeOf(value[i], type, {})
  }
  return size
}
