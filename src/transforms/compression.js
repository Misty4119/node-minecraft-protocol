'use strict'

const [readVarInt, writeVarInt, sizeOfVarInt] = require('protodef').types.varint
const zlib = require('zlib')
const Transform = require('readable-stream').Transform
const { DEFAULT_MAX_PACKET_SIZE, validateMaxPacketSize } = require('../packetLimits')

module.exports.createCompressor = function (threshold) {
  return new Compressor(threshold)
}

module.exports.createDecompressor = function (threshold, hideErrors, maxPacketSize) {
  return new Decompressor(threshold, hideErrors, maxPacketSize)
}

class Compressor extends Transform {
  constructor (compressionThreshold = -1) {
    super()
    this.compressionThreshold = compressionThreshold
  }

  _transform (chunk, enc, cb) {
    if (chunk.length >= this.compressionThreshold) {
      try {
        const newChunk = zlib.deflateSync(chunk)
        const buf = Buffer.alloc(sizeOfVarInt(chunk.length) + newChunk.length)
        const offset = writeVarInt(chunk.length, buf, 0)
        newChunk.copy(buf, offset)
        this.push(buf)
        return cb()
      } catch (err) {
        return cb(err)
      }
    } else {
      const buf = Buffer.alloc(sizeOfVarInt(0) + chunk.length)
      const offset = writeVarInt(0, buf, 0)
      chunk.copy(buf, offset)
      this.push(buf)
      return cb()
    }
  }
}

class Decompressor extends Transform {
  constructor (compressionThreshold = -1, hideErrors = false, maxPacketSize = DEFAULT_MAX_PACKET_SIZE) {
    super()
    this.compressionThreshold = compressionThreshold
    this.hideErrors = hideErrors
    this.maxPacketSize = validateMaxPacketSize(maxPacketSize)
  }

  _transform (chunk, enc, cb) {
    let parsed
    try {
      parsed = readVarInt(chunk, 0)
    } catch (err) {
      return cb(err)
    }
    const { size, value, error } = parsed
    if (error) { return cb(error) }
    if (value < 0) return cb(new Error(`invalid negative uncompressed packet length ${value}`))
    if (value > this.maxPacketSize) {
      return cb(new Error(`uncompressed packet length ${value} exceeds maximum ${this.maxPacketSize}`))
    }
    if (value === 0) {
      this.push(chunk.slice(size))
      return cb()
    } else {
      try {
        const newBuf = zlib.unzipSync(chunk.slice(size), { finishFlush: 2, maxOutputLength: this.maxPacketSize })
        if (newBuf.length > this.maxPacketSize) {
          return cb(new Error(`decompressed packet length ${newBuf.length} exceeds maximum ${this.maxPacketSize}`))
        }
        if (newBuf.length !== value) {
          return cb(new Error(`uncompressed packet length mismatch: expected ${value}, got ${newBuf.length}`))
        }
        this.push(newBuf)
        return cb()
      } catch (err) {
        if (err.code === 'ERR_BUFFER_TOO_LARGE') {
          return cb(new Error(`decompressed packet exceeds maximum ${this.maxPacketSize}`))
        }
        if (!this.hideErrors) {
          console.error('problem inflating chunk')
          console.error('uncompressed length ' + value)
          console.error('compressed length ' + chunk.length)
          console.error('hex ' + chunk.toString('hex').slice(0, 128))
        }
        return cb(err)
      }
    }
  }
}
