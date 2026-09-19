/* eslint-env mocha */

const assert = require('assert')
const zlib = require('zlib')
const framing = require('../src/transforms/framing')
const compression = require('../src/transforms/compression')
const Client = require('../src/client')
const Server = require('../src/server')

describe('packet size limits', function () {
  it('rejects an oversized frame as soon as its length prefix arrives', function (done) {
    const splitter = framing.createSplitter({ maxPacketSize: 64 })
    splitter.once('error', err => {
      assert.match(err.message, /packet length 65 exceeds maximum 64/)
      done()
    })
    splitter.write(Buffer.from([65]))
  })

  it('rejects invalid packet limit configuration', function () {
    assert.throws(() => framing.createSplitter({ maxPacketSize: 0 }), /maxPacketSize/)
    assert.throws(() => framing.createSplitter({ maxPacketSize: 1.5 }), /maxPacketSize/)
  })

  it('uses the configured cap for protocol clients and servers', function () {
    const version = '1.21.11'
    const client = new Client(false, version, undefined, false, 64)
    const server = new Server(version, undefined, false, 64)
    assert.strictEqual(client.maxPacketSize, 64)
    assert.strictEqual(server.maxPacketSize, 64)
    assert.strictEqual(client.splitter.maxPacketSize, 64)
    assert.strictEqual(new Client(false, version).maxPacketSize, 16 * 1024 * 1024)
  })

  it('rejects a declared decompressed size above the configured limit', function (done) {
    const decompressor = compression.createDecompressor(0, false, 64)
    decompressor.once('error', err => {
      assert.match(err.message, /uncompressed packet length 65 exceeds maximum 64/)
      done()
    })
    const compressed = zlib.deflateSync(Buffer.alloc(65))
    decompressor.write(Buffer.concat([Buffer.from([65]), compressed]))
  })

  it('bounds decompression output even when a peer lies in the size prefix', function (done) {
    const decompressor = compression.createDecompressor(0, false, 64)
    decompressor.once('error', err => {
      assert.match(err.message, /maximum|larger than/i)
      done()
    })
    const compressed = zlib.deflateSync(Buffer.alloc(1024))
    decompressor.write(Buffer.concat([Buffer.from([1]), compressed]))
  })
})
