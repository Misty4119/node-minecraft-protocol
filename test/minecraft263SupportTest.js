/* eslint-env mocha */

const assert = require('assert')
const minecraftProtocol = require('../')
const minecraftDatatypes = require('../src/datatypes/minecraft')

describe('Minecraft Java 26.3 protocol support', function () {
  it('advertises 26.3 as its latest supported default version', function () {
    assert.ok(minecraftProtocol.supportedVersions.includes('26.3'))
    assert.strictEqual(minecraftProtocol.defaultVersion, '26.3')
  })

  it('round-trips legacy and stepped entity movement deltas', function () {
    const [readEntityDelta, writeEntityDelta, sizeOfEntityDelta] = minecraftDatatypes.entityDelta
    const values = [
      { onGround: true, steps: [{ dX: -128, dY: 64, dZ: 3 }] },
      {
        onGround: false,
        steps: [
          { ticks: 0, dX: 1, dY: -2, dZ: 3 },
          { ticks: 7, dX: -4, dY: 5, dZ: -6 }
        ]
      }
    ]

    for (const value of values) {
      const size = sizeOfEntityDelta(value)
      const buffer = Buffer.alloc(size)
      assert.strictEqual(writeEntityDelta(value, buffer, 0), size)
      assert.deepStrictEqual(readEntityDelta(buffer, 0).value, value)
      assert.strictEqual(readEntityDelta(buffer, 0).size, size)
    }

    assert.throws(() => sizeOfEntityDelta({ onGround: false, steps: [] }), /at least one movement step/)
    assert.throws(() => readEntityDelta(Buffer.from([0x04, 0, 0, 0, 0, 0, 0, 0]), 0), /step count/)
  })

  it('accepts vanilla 26.3 truncated component container content', function () {
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3' })
    const packet = Buffer.concat([
      Buffer.from('12010127', 'hex'),
      Buffer.alloc(27),
      Buffer.from('019a080000', 'hex'),
      Buffer.from('01f30a01002d012105', 'hex'),
      Buffer.alloc(9)
    ])

    const parsed = deserialize.parsePacketBuffer(packet)
    assert.strictEqual(parsed.data.name, 'window_items')
    assert.strictEqual(parsed.data.params.items.length, 39)
    assert.deepStrictEqual(parsed.data.params.items[27], {
      itemCount: 1,
      itemId: 1050,
      addedComponentCount: 0,
      removedComponentCount: 0,
      components: [],
      removeComponents: []
    })
    assert.deepStrictEqual(parsed.data.params.items[28].components, [{
      type: 'stored_enchantments',
      data: { enchantments: [{ id: 33, level: 5 }] }
    }])
    assert.deepStrictEqual(parsed.data.params.carriedItem, { itemCount: 0 })
    assert.strictEqual(parsed.metadata.size, packet.length)
  })
})
