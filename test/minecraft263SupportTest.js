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

  it('consumes the 26.3 team and explosion packet tails', function () {
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', version: '26.3', noErrorLogging: true })
    const teamPacket = Buffer.from('6f0474657374000800047465737408000008000000000102030107666c6174626f74', 'hex')
    const explosionPacket = Buffer.from('243fe0000000000000c04d8000000000003ff800000000000040c00000000005ee0100000000000000003fc7ccbdad2fe204bfd331802e5a08d31dc00502453f0000003f80000001483f8000003f8000000101', 'hex')

    const team = deserialize.parsePacketBuffer(teamPacket)
    const explosion = deserialize.parsePacketBuffer(explosionPacket)

    assert.strictEqual(team.metadata.size, teamPacket.length)
    assert.deepStrictEqual(team.data.params.players, ['flatbot'])
    assert.strictEqual(team.data.params.color, 2)
    assert.strictEqual(explosion.metadata.size, explosionPacket.length)
    assert.strictEqual(explosion.data.params.playSound, true)
  })

  it('round-trips the 26.3 use_entity interaction flag', function () {
    const serialize = minecraftProtocol.createSerializer({ state: 'play', version: '26.3' })
    const deserialize = minecraftProtocol.createDeserializer({ state: 'play', isServer: true, version: '26.3', noErrorLogging: true })
    const packet = serialize.createPacketBuffer({
      name: 'use_entity',
      params: {
        target: 1,
        hand: 'main_hand',
        location: { x: 0, y: 0, z: 0 },
        usingSecondaryAction: true
      }
    })

    assert.strictEqual(deserialize.parsePacketBuffer(packet).data.params.usingSecondaryAction, true)
  })
})
