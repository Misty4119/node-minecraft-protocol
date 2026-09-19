'use strict'

const [readVarInt, writeVarInt, sizeOfVarInt] = require('protodef').types.varint
const Transform = require('readable-stream').Transform
const { DEFAULT_MAX_PACKET_SIZE, validateMaxPacketSize } = require('../packetLimits')

module.exports.createSplitter = function (options) {
  return new Splitter(options)
}

module.exports.createFramer = function () {
  return new Framer()
}

class Framer extends Transform {
  _transform (chunk, enc, cb) {
    const varIntSize = sizeOfVarInt(chunk.length)
    const buffer = Buffer.alloc(varIntSize + chunk.length)
    writeVarInt(chunk.length, buffer, 0)
    chunk.copy(buffer, varIntSize)
    this.push(buffer)
    return cb()
  }
}

const LEGACY_PING_PACKET_ID = 0xfe

class Splitter extends Transform {
  constructor ({ maxPacketSize = DEFAULT_MAX_PACKET_SIZE } = {}) {
    super()
    this.buffer = Buffer.alloc(0)
    this.recognizeLegacyPing = false
    this.maxPacketSize = validateMaxPacketSize(maxPacketSize)
  }

  _transform (chunk, enc, cb) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    if (this.recognizeLegacyPing && this.buffer[0] === LEGACY_PING_PACKET_ID) {
      // legacy_server_list_ping packet follows a different protocol format
      if (this.buffer.length > this.maxPacketSize) {
        const length = this.buffer.length
        this.buffer = Buffer.alloc(0)
        return cb(new Error(`packet length ${length} exceeds maximum ${this.maxPacketSize}`))
      }
      // prefix the encoded varint packet id for the deserializer
      const header = Buffer.alloc(sizeOfVarInt(LEGACY_PING_PACKET_ID))
      writeVarInt(LEGACY_PING_PACKET_ID, header, 0)
      let payload = this.buffer.slice(1) // remove 0xfe packet id
      if (payload.length === 0) payload = Buffer.from('\0') // TODO: update minecraft-data to recognize a lone 0xfe, https://github.com/PrismarineJS/minecraft-data/issues/95
      this.push(Buffer.concat([header, payload]))
      return cb()
    }

    let offset = 0
    let packetLength
    const readLength = position => {
      try {
        return readVarInt(this.buffer, position)
      } catch (err) {
        if (err.partialReadError) return null
        throw err
      }
    }

    try {
      packetLength = readLength(offset)
      while (packetLength) {
        const { value, size } = packetLength
        if (value < 0) throw new Error(`invalid negative packet length ${value}`)
        if (value > this.maxPacketSize) {
          throw new Error(`packet length ${value} exceeds maximum ${this.maxPacketSize}`)
        }
        if (this.buffer.length < offset + size + value) break

        this.push(this.buffer.slice(offset + size, offset + size + value))
        offset += size + value
        packetLength = readLength(offset)
      }
    } catch (err) {
      this.buffer = Buffer.alloc(0)
      return cb(err)
    }

    this.buffer = this.buffer.slice(offset)
    return cb()
  }
}
